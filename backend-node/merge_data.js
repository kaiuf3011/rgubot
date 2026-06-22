import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const chatDataPath = path.join(__dirname, 'data', 'chat_data.txt');
const outputPath = path.join(__dirname, 'data', 'knowledge.json');

// Deep merge helper
function isObject(item) {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

function deepMerge(target, source) {
  const output = Object.assign({}, target);
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else if (Array.isArray(source[key]) && Array.isArray(target[key])) {
        // Concatenate arrays
        output[key] = [...target[key], ...source[key]];
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}

function main() {
  console.log("Reading chat data...");
  const content = fs.readFileSync(chatDataPath, 'utf8');

  // Split by the message header pattern
  const messagePattern = /\[\d{2}\/\d{2}\/\d{2},\s+[^\]]+\]\s+Gokuu:\s*/g;
  const blocks = content.split(messagePattern).filter(b => b.trim().length > 0);

  console.log(`Found ${blocks.length} message blocks.`);

  let mergedData = {};
  let parsedCount = 0;

  for (let i = 0; i < blocks.length; i++) {
    const rawBlock = blocks[i].trim();
    // Locate the first '{' and the last '}' to extract JSON
    const firstBrace = rawBlock.indexOf('{');
    const lastBrace = rawBlock.lastIndexOf('}');
    
    if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
      console.warn(`Block ${i + 1} does not contain valid braces. Skipping.`);
      continue;
    }

    const jsonStr = rawBlock.substring(firstBrace, lastBrace + 1);
    try {
      const obj = JSON.parse(jsonStr);
      mergedData = deepMerge(mergedData, obj);
      parsedCount++;
    } catch (err) {
      console.error(`Error parsing JSON in block ${i + 1}:`, err.message);
    }
  }

  console.log(`Successfully parsed and merged ${parsedCount} out of ${blocks.length} blocks.`);

  // Write out merged data
  fs.writeFileSync(outputPath, JSON.stringify(mergedData, null, 2), 'utf8');
  console.log(`Merged database written successfully to ${outputPath}`);
  console.log(`Total keys at root: ${Object.keys(mergedData).join(', ')}`);
}

main();
