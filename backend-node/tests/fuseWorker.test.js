import { describe, it, expect, vi } from 'vitest';
import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Phase 6: Scalability (Fuse.js Worker)', () => {
  it('P6-U1: Worker thread returns results', async () => {
    const workerPath = path.join(__dirname, '../engine/fuseWorker.js');
    const worker = new Worker(workerPath);
    
    // Initialize
    const chunks = [
      { id: '1', parentId: 'p1', category: 'test', keywords: ['hello'], text: 'Hello world from worker', searchContent: 'test hello Hello world from worker' }
    ];
    worker.postMessage({ type: 'init', data: chunks });
    
    // Wait for init
    await new Promise(resolve => {
      worker.once('message', msg => {
        if (msg.type === 'initialized') resolve();
      });
    });
    
    // Search
    worker.postMessage({ type: 'search', id: 1, query: 'hello', limit: 10 });
    
    const results = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout')), 500);
      worker.once('message', msg => {
        clearTimeout(timeout);
        resolve(msg);
      });
    });
    
    worker.terminate();
    
    expect(results.type).toBe('result');
    expect(results.id).toBe(1);
    expect(results.results.length).toBe(1);
    expect(results.results[0].text).toBe('Hello world from worker');
  });
});
