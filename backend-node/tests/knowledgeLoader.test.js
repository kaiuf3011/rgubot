import { describe, it, expect } from 'vitest';
import { generateChildChunks } from '../engine/knowledgeLoader.js';

describe('generateChildChunks (Semantic Boundary-Aware Chunking)', () => {
  it('should split on paragraph boundaries (double newlines)', () => {
    // Generate a long text with paragraphs
    // A single paragraph will be kept together if under MAX_CHILD_TOKENS
    const para1 = "Paragraph 1 is here. ".repeat(20);
    const para2 = "Paragraph 2 is here. ".repeat(20);
    const text = `${para1}\n\n${para2}`;
    
    const chunks = generateChildChunks(text, 'parent1', 'test_category', 'test_source');
    
    expect(chunks.length).toBe(2);
    expect(chunks[0].text).toBe(para1.trim());
    expect(chunks[1].text).toBe(para2.trim());
  });

  it('should never split in the middle of a key:value pair (single newlines inside long paragraphs)', () => {
    // If a paragraph is longer than MAX_CHILD_TOKENS, it splits on single newlines
    // Make sure it doesn't break a line
    const lines = Array.from({ length: 50 }).map((_, i) => `key${i}: value${i} is a very long value that takes up some tokens`);
    const text = lines.join('\n');
    
    const chunks = generateChildChunks(text, 'parent1', 'test_category', 'test_source');
    
    // Each chunk should contain complete lines only. No line should be cut in half.
    // If a line is cut in half, the split would happen mid-string.
    // We can verify this by checking if every chunk text ends with one of the values or begins with one of the keys
    for (const chunk of chunks) {
      const chunkLines = chunk.text.split('\n');
      for (const line of chunkLines) {
        expect(line).toMatch(/^key\d+: value\d+/);
      }
    }
    
    expect(chunks.length).toBeGreaterThan(1); // It had to split due to length
  });
});
