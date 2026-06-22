import { NvidiaProvider } from './backend-node/llm-providers/nvidia.js';

async function test() {
  try {
    console.log("Testing NVIDIA API...");
    const res = await NvidiaProvider.generate("Say hello", (token) => {
      process.stdout.write(token);
    });
    console.log("\n\nDone:", res);
  } catch (err) {
    console.error("\n\nError caught:", err.message);
  }
}

test();
