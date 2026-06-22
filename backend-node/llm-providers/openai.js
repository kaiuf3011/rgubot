/**
 * OpenAI LLM Provider Adapter
 * Uses the official openai SDK.
 *
 * Required .env variables:
 *   OPENAI_API_KEY=your_key_here
 *   OPENAI_MODEL=gpt-4o-mini (optional, defaults to gpt-4o-mini)
 */

import OpenAI from 'openai';

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set in your .env file.');
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export const OpenAIProvider = {
  name: 'openai',

  /**
   * Streaming generation.
   * OpenAI streams text chunks — we wrap them and pass the full accumulated JSON to onToken.
   */
  async generate(prompt, onToken = null, signal = null) {
    const openai = getClient();
    const responseStream = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      response_format: { type: 'json_object' },
      stream: true
    }, { signal });

    let accumulatedJson = '';

    for await (const chunk of responseStream) {
      if (signal?.aborted) break;

      const text = chunk.choices[0]?.delta?.content || '';
      if (text) {
        accumulatedJson += text;
        if (onToken) onToken(accumulatedJson);
      }
    }

    return accumulatedJson;
  },

  async generateJSON(prompt, signal = null) {
    const openai = getClient();
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    }, { signal });

    return response.choices[0]?.message?.content ?? null;
  },
};
