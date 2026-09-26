import { inspectOllama, chatWithOllama } from "./ollama.js";

import { inspectLmStudio, chatWithLmStudio } from "./lmStudio.js";

import { inspectLlamaCpp, chatWithLlamaCpp } from "./llamaCpp.js";

export const localEndpoints = [
  {
    endpointId: "ollama-default",
    provider: "ollama",
    inspect: inspectOllama,
    chat: chatWithOllama,
  },
  {
    endpointId: "lmstudio-default",
    provider: "lmstudio",
    inspect: inspectLmStudio,
    chat: chatWithLmStudio,
  },
  {
    endpointId: "llamacpp-default",
    provider: "llamacpp",
    inspect: inspectLlamaCpp,
    chat: chatWithLlamaCpp,
  },
];

export function getLocalEndpoint(endpointId) {
  return localEndpoints.find((endpoint) => endpoint.endpointId === endpointId);
}
