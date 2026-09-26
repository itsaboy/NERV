const OLLAMA_BASE_URL = "http://127.0.0.1:11434";

export async function inspectOllama() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
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

    const models = Array.isArray(data.models)
      ? data.models.map((model) => model.name).filter(Boolean)
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

export async function chatWithOllama({
  model,
  instructions,
  input,
  signal,
  onChunk,
  onStarted,
}) {
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

  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const body = await response.text();

    throw new Error(`Ollama request failed (${response.status}): ${body}`);
  }

  if (!response.body) {
    throw new Error("Ollama returned no response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let fullText = "";
  let finalResponse = null;
  let started = false;

  const markStarted = () => {
    if (started) return;
    started = true;
    onStarted?.();
  };

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, {
      stream: true,
    });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;

      const data = JSON.parse(line);

      const chunk = data.message?.content;
      const thinking = data.message?.thinking;

      if (chunk || thinking) {
        markStarted();
      }

      if (chunk) {
        fullText += chunk;
        onChunk?.(chunk);
      }

      if (data.done) {
        finalResponse = data;
      }
    }
  }

  if (buffer.trim()) {
    const data = JSON.parse(buffer);

    const chunk = data.message?.content;
    const thinking = data.message?.thinking;

    if (chunk || thinking) {
      markStarted();
    }

    if (chunk) {
      fullText += chunk;
      onChunk?.(chunk);
    }

    if (data.done) {
      finalResponse = data;
    }
  }

  return {
    text: fullText,
    usage: finalResponse
      ? {
          inputTokens: finalResponse.prompt_eval_count ?? null,
          outputTokens: finalResponse.eval_count ?? null,
          totalTokens:
            typeof finalResponse.prompt_eval_count === "number" &&
            typeof finalResponse.eval_count === "number"
              ? finalResponse.prompt_eval_count + finalResponse.eval_count
              : null,
        }
      : null,
  };
}
