import { Worker } from 'worker_threads';
import { logger } from '../../src/utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKER_COUNT = parseInt(process.env.FUSE_WORKERS || '4', 10);
let workers = [];
let nextWorkerIndex = 0;
let requestCounter = 0;
const resolvers = new Map();

/**
 * Initializes the Round-Robin Worker Pool for Sparse Search
 * @param {Array} enrichedChunks - The chunks to index in Fuse.js
 */
export function initSparseWorkers(enrichedChunks) {
  if (workers.length > 0) {
    workers.forEach(w => w.terminate());
    workers = [];
  }

  for (let i = 0; i < WORKER_COUNT; i++) {
    const worker = new Worker(path.join(__dirname, '../fuseWorker.js'));
    
    worker.on('message', (msg) => {
      if (msg.type === 'result') {
        const resolve = resolvers.get(msg.id);
        if (resolve) {
          resolve(msg.results);
          resolvers.delete(msg.id);
        }
      }
    });

    worker.on('error', (err) => logger.error({ err, workerId: i }, "Fuse worker error"));
    
    // Distribute data to each worker
    worker.postMessage({ type: 'init', data: enrichedChunks });
    workers.push(worker);
  }

  logger.info(`Initialized Sparse Search Worker Pool with ${WORKER_COUNT} threads.`);
}

/**
 * Submits a sparse search query to the worker pool.
 * @param {string} query - The search query
 * @param {number} limit - The max number of results
 * @returns {Promise<Array>} - The retrieved chunks
 */
export async function executeSparseSearch(query, limit = 4) {
  if (workers.length === 0) return [];

  const id = requestCounter++;
  const worker = workers[nextWorkerIndex];
  nextWorkerIndex = (nextWorkerIndex + 1) % workers.length;

  return new Promise(resolve => {
    resolvers.set(id, resolve);
    
    // Safety timeout to prevent hanging promises
    const timeoutId = setTimeout(() => {
      if (resolvers.has(id)) {
        resolvers.delete(id);
        resolve([]); // Return empty on timeout to avoid blocking fusion
        logger.warn({ query, id }, "Sparse worker search timed out after 1000ms");
      }
    }, 1000);

    worker.postMessage({ type: 'search', id, query, limit });
    
    // We clear timeout if it resolves early (handled via intercepting resolve)
    const originalResolve = resolve;
    resolvers.set(id, (val) => {
      clearTimeout(timeoutId);
      originalResolve(val);
    });
  });
}

/**
 * Terminates all workers in the pool gracefully.
 */
export function terminateSparseWorkers() {
  workers.forEach(w => w.terminate());
  workers = [];
  logger.info("Sparse Search Worker Pool terminated.");
}

/**
 * Exposes a boolean to check if workers are available.
 */
export function isSparseReady() {
  return workers.length > 0;
}
