/**
 * Google Gemini LLM Provider Adapter
 * Uses the @google/generative-ai SDK.
 *
 * Required .env variables:
 *   GEMINI_API_KEY=your_key_here
 *   GEMINI_MODEL=gemini-1.5-flash   (optional, defaults to gemini-1.5-flash)
 *
 * Install: npm install @google/generative-ai
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set in your .env file.');
  }
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

export const GeminiProvider = {
  name: 'gemini',

  /**
   * Streaming generation.
   * Gemini streams text chunks — we wrap them to call onToken(text)
   * and return the full accumulated JSON string.
   */
  async generate(prompt, onToken = null, signal = null) {
    const genAI = getClient();
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        temperature: 0.6,
        responseMimeType: 'application/json',
      },
    });

    const result = await model.generateContentStream(prompt);

    let accumulatedJson = '';

    for await (const chunk of result.stream) {
      if (signal?.aborted) break;

      const text = chunk.text();
      if (text) {
        accumulatedJson += text;
        if (onToken) onToken(accumulatedJson);
      }
    }

    return accumulatedJson;
  },

  async generateJSON(prompt, signal = null) {
    const genAI = getClient();
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
      },
    });

    const result = await model.generateContent(prompt);
    return result.response.text() ?? null;
  },
};
