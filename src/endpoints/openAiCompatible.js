const OPENAI_COMPAT_BASE_URL =
  process.env.NERV_OPENAI_COMPAT_URL?.replace(/\/+$/, "") ?? null;

export async function inspectOpenAiCompatible() {
  if (!OPENAI_COMPAT_BASE_URL) {
    return {
      available: false,
      models: [],
      error: "NERV_OPENAI_COMPATIBLE_URL is not configured",
    };
  }

  try {
    const response = await fetch(`${OPENAI_COMPAT_BASE_URL}/v1/models`, {
      signal: AbortSignal.timeout(2000),
    });

    if (!response.ok) {
      return {
        available: false,
        models: [],
        error: `HTTP ${response.status}`,
      };
    }

    const data = await response.json();

    const models = Array.isArray(data.data)
      ? data.data.map((model) => model.id).filter(Boolean)
      : [];

    return {
      available: true,
      models,
      error: null,
    };
  } catch (error) {
    return {
      available: false,
      models: [],
      error: error.message,
    };
  }
}

export async function chatWithOpenAiCompatible({
  model,
  instructions,
  input,
  signal,
  onChunk,
  onStarted,
}) {
  if (!OPENAI_COMPAT_BASE_URL) {
    throw new Error("NERV_OPENAI_COMPATIBLE_URL is not configured");
  }

  const messages = [];

  if (instructions) {
    messages.push({
      role: "system",
      content: instructions,
    });
  }

  messages.push({
    role: "user",
    content: input,
  });

  const response = await fetch(
    `${OPENAI_COMPAT_BASE_URL}/v1/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        stream_options: {
          include_usage: true,
        },
      }),
      signal,
    },
  );

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `OpenAI-compatible request failed (${response.status}): ${body}`,
    );
  }

  if (!response.body) {
    throw new Error("OpenAI-compatible endpoint returned no response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let fullText = "";
  let usage = null;
  let finishReason = null;
  let started = false;

  const markStarted = () => {
    if (started) return;

    started = true;
    onStarted?.();
  };

  const processEvent = (event) => {
    const line = event.trim();

    if (!line.startsWith("data:")) {
      return;
    }

    const payload = line.slice(5).trim();

    if (!payload || payload === "[DONE]") {
      return;
    }

    const data = JSON.parse(payload);

    const choice = data.choices?.[0];
    const reasoning =
      choice?.delta?.reasoning_content ?? choice?.delta?.reasoning;
    const chunk = choice?.delta?.content;

    if (reasoning || chunk) {
      markStarted();
    }

    if (chunk) {
      fullText += chunk;
      onChunk?.(chunk);
    }

    if (choice?.finish_reason) {
      finishReason = choice.finish_reason;
    }

    if (data.usage) {
      usage = {
        inputTokens: data.usage.prompt_tokens ?? null,
        outputTokens: data.usage.completion_tokens ?? null,
        totalTokens: data.usage.total_tokens ?? null,
        reasoningTokens:
          data.usage.completion_tokens_details?.reasoning_tokens ?? null,
      };
    }
  };

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, {
      stream: true,
    });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      processEvent(event);
    }
  }

  if (buffer.trim()) {
    processEvent(buffer);
  }

  return {
    text: fullText,
    finishReason: finishReason ?? "stop",
    usage,
  };
}
