import readline from 'readline';
import { loadKnowledgeBase } from './engine/knowledgeLoader.js';
import { initVectorStore, vectorSearch } from './engine/vectorSearch.js';
import { rewriteQuery, generateRAGResponse } from './engine/llmService.js';
import { getSessionContext } from './src/services/redis.service.js';
import { detectIntent } from './engine/intentDetector.js';

// Setup Global state required by the RAG services
global.knowledgeBase = null;
global.isReady = false;

// ANSI Color Escape Codes
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';

// Banner
console.log(`\n${BOLD}${CYAN}==================================================`);
console.log(`🤖  RGU CHATBOT ASSISTANT (Terminal CLI Mode) 🚀`);
console.log(`==================================================${RESET}\n`);

// Initialize RAG components
async function initialize() {
  try {
    console.log(`${YELLOW}[⚙️] Loading knowledge base files...${RESET}`);
    global.knowledgeBase = loadKnowledgeBase();
    
    console.log(`${YELLOW}[🔍] Initializing Hybrid Vector Store...${RESET}`);
    await initVectorStore(global.knowledgeBase);
    
    global.isReady = true;
    console.log(`${GREEN}[✅] Initialization completed successfully!${RESET}`);
    console.log(`${DIM}--------------------------------------------------${RESET}`);
    console.log(`${BOLD}${WHITE}Ready! Ask me anything about RGU / Raise Smart.${RESET}`);
    console.log(`${DIM}Commands: 'exit' or 'quit' to exit | 'reset' to clear chat history${RESET}`);
    console.log(`${DIM}--------------------------------------------------${RESET}`);
  } catch (error) {
    console.error(`${RED}[❌] Initialization failed:${RESET}`, error);
    process.exit(1);
  }
}

const SYNONYM_MAP = {
  "rgu": ["rathinam", "r-smart", "college", "university"],
  "be": ["bachelor of engineering", "engineering"],
  "btech": ["bachelor of technology", "engineering"],
  "cse": ["computer science"],
  "ece": ["electronics"],
  "eee": ["electrical"],
  "it": ["information technology"],
  "mba": ["master of business administration", "management"],
  "mca": ["master of computer applications"],
  "hod": ["head of department"],
  "placement": ["job", "career", "placed", "salary", "package"],
  "scholarship": ["fees waiver", "discount", "financial aid", "rstnat", "rgunat"]
};

// Intent matching wrapper
function matchIntent(query) {
  if (global.knowledgeBase && global.knowledgeBase.intents) {
    const matchedIntent = detectIntent(query, global.knowledgeBase.intents, SYNONYM_MAP);
    if (matchedIntent && matchedIntent.matched) {
      const response = matchedIntent.responses[Math.floor(Math.random() * matchedIntent.responses.length)];
      return {
        answer: response,
        highlights: [],
        suggestions: [],
        intent: matchedIntent.tag
      };
    }
  }
  return null;
}

// Local in-memory session (no Redis required for CLI)
let session = { messages: [] };

async function startCli() {
  await initialize();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const promptUser = () => {
    rl.question(`\n${BOLD}${GREEN}👤 You > ${RESET}`, async (input) => {
      const query = input.trim();
      
      if (!query) {
        promptUser();
        return;
      }

      if (query.toLowerCase() === 'exit' || query.toLowerCase() === 'quit') {
        console.log(`\n${YELLOW}Goodbye! 👋${RESET}\n`);
        rl.close();
        process.exit(0);
      }

      if (query.toLowerCase() === 'reset') {
        session.messages = [];
        console.log(`\n${YELLOW}[🔄] Conversation history has been reset.${RESET}`);
        promptUser();
        return;
      }

      process.stdout.write(`\n${BOLD}${CYAN}🤖 Assistant > ${RESET}${CYAN}`);

      try {
        // 1. Check Intent Router
        const matchedIntent = matchIntent(query);
        if (matchedIntent) {
          // Intent match: print instantly
          process.stdout.write(matchedIntent.answer + '\n' + RESET);
          
          session.messages.push({ role: 'user', text: query });
          session.messages.push({ role: 'bot', text: matchedIntent.answer });
          if (session.messages.length > 6) {
            session.messages = session.messages.slice(-6);
          }
          promptUser();
          return;
        }

        // 2. Get history context
        const historyContext = getSessionContext(session);

        // 3. Rewrite query for search
        let rewrittenQueries = [query];
        try {
          rewrittenQueries = await rewriteQuery(query, historyContext);
        } catch (e) {
          // Fallback to original
          rewrittenQueries = [query];
        }

        // 4. Hybrid vector search
        const searchResults = await vectorSearch(rewrittenQueries, 4);

        // 5. Generate and Stream response
        const responseData = await generateRAGResponse(
          query,
          searchResults,
          historyContext,
          (token) => {
            process.stdout.write(token);
          }
        );

        // Close color styling
        process.stdout.write(RESET + '\n');

        // Append to history
        session.messages.push({ role: 'user', text: query });
        session.messages.push({ role: 'bot', text: responseData.answer });
        if (session.messages.length > 6) {
          session.messages = session.messages.slice(-6);
        }

        // Show Highlights & Suggestions if available
        if (responseData.highlights && responseData.highlights.length > 0) {
          console.log(`\n${DIM}──────────────────────────────────────────────────${RESET}`);
          console.log(`${BOLD}${CYAN}💡 Highlights:${RESET}`);
          responseData.highlights.forEach(h => console.log(`   ✨ ${CYAN}${h}${RESET}`));
        }

        if (responseData.suggestions && responseData.suggestions.length > 0) {
          console.log(`${BOLD}${YELLOW}❓ Suggested follow-ups:${RESET}`);
          responseData.suggestions.forEach(s => console.log(`   • ${YELLOW}${s}${RESET}`));
        }

      } catch (err) {
        process.stdout.write(RESET + '\n');
        console.error(`\n${RED}[❌] Error processing request:${RESET}`, err.message || err);
      }

      promptUser();
    });
  };

  promptUser();
}

startCli();
