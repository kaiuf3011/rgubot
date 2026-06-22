/**
 * LLM Provider Router — index.js
 *
 * This is the ONLY file llmService.js imports from the adapter folder.
 * Supports Google Gemini and OpenAI.
 */

import { GeminiProvider } from './gemini.js';
import { OpenAIProvider } from './openai.js';

const providerName = (process.env.LLM_PROVIDER || 'openai').toLowerCase();

let activeProvider;
let fallbackProvider;

if (providerName === 'gemini') {
  activeProvider = GeminiProvider;
  fallbackProvider = OpenAIProvider;
} else {
  activeProvider = OpenAIProvider;
  fallbackProvider = GeminiProvider;
}

console.log(`[LLM Provider] Active: ${activeProvider.name.toUpperCase()} | Fallback: ${fallbackProvider.name.toUpperCase()}`);

export const LLMProvider = activeProvider;
export const FallbackProvider = fallbackProvider;
