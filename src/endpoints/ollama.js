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
