import { generateRAGResponse, rewriteQuery } from './llmService.js';
import { vectorSearch } from './vectorSearch.js';
import { detectIntent } from './intentDetector.js';
import { checkTopic, getOffTopicResponse, getInappropriateResponse, isGreeting, getGreetingResponse } from './topicGuard.js';
import { logger } from '../src/utils/logger.js';

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

export async function processChatTurn(query, pageContext, session, sessionId, onToken, abortSignal) {
  const historyContext = session.messages;

  // --- TOPIC GUARD & SECURITY MIDDLEWARE ---
  const topicCheck = checkTopic(query, session.messages.length > 0);
  if (!topicCheck.allowed) {
    logger.warn({ reason: topicCheck.reason, query }, 'Topic guard rejected query');
    const payload = topicCheck.reason === 'inappropriate' 
      ? getInappropriateResponse() 
      : getOffTopicResponse();
    payload.sessionId = sessionId;
    
    // Simulate streaming for fast-track responses if stream callback exists
    if (onToken) {
      const words = payload.answer.split(' ');
      for (const word of words) {
        if (abortSignal?.aborted) break;
        onToken(word + ' ');
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    return payload;
  }

  if (session.messages.length === 0 && isGreeting(query)) {
    logger.info('Greeting detected, sending instant response');
    const payload = getGreetingResponse();
    payload.sessionId = sessionId;
    
    if (onToken) {
      const words = payload.answer.split(' ');
      for (const word of words) {
        if (abortSignal?.aborted) break;
        onToken(word + ' ');
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    return payload;
  }
  // --- END TOPIC GUARD ---

  // --- EXACT MATCH INTENT ROUTER ---
  if (global.knowledgeBase && global.knowledgeBase.intents) {
    const matchedIntent = detectIntent(query, global.knowledgeBase.intents, SYNONYM_MAP, pageContext);
    if (matchedIntent && matchedIntent.matched) {
      const response = matchedIntent.responses[Math.floor(Math.random() * matchedIntent.responses.length)];
      logger.info({ intent: matchedIntent.tag, score: matchedIntent.confidence }, 'Intent router matched');
      
      const payload = {
        answer: response,
        highlights: [],
        suggestions: [],
        intent: matchedIntent.tag,
        sessionId
      };

      if (onToken) {
        const words = payload.answer.split(' ');
        for (const word of words) {
          if (abortSignal?.aborted) break;
          onToken(word + ' ');
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      return payload;
    }
  }
  // --- END INTENT ROUTER ---

  const rewriteAbortController = new AbortController();
  const rewriteTimeoutId = setTimeout(() => rewriteAbortController.abort(), 6000);

  let searchResults = [];
  const PRONOUNS = /\b(it|that|this|these|those|they|them|he|she)\b/i;
  const isSimple = session.messages.length === 0 && !PRONOUNS.test(query);
  const isShort = query.split(/\s+/).length <= 3;

  if (isSimple && isShort) {
    searchResults = await vectorSearch([query], 30);
    clearTimeout(rewriteTimeoutId);
    logger.info({ docCount: searchResults.length, parallel: false, fastTrack: true }, 'Vector search completed (fast-track path)');
  } else if (isSimple) {
    let rewriteDone = false;
    let rewrittenQueries = [];
    
    const rewritePromise = rewriteQuery(query, historyContext, pageContext, rewriteAbortController.signal)
      .then(q => { rewriteDone = true; rewrittenQueries = q; })
      .catch(() => { rewriteDone = true; });

    searchResults = await vectorSearch([query], 30);

    // Wait for the rewrite to finish, up to 1500ms
    const startWait = Date.now();
    while (!rewriteDone && Date.now() - startWait < 1500) {
      await new Promise(r => setTimeout(r, 50));
    }

    if (rewriteDone && rewrittenQueries.length > 0 && rewrittenQueries[0] !== query) {
      const extraResults = await vectorSearch(rewrittenQueries, 30);
      const combined = [...searchResults, ...extraResults];
      const unique = [];
      const seen = new Set();
      for (const doc of combined) {
        if (!seen.has(doc.text)) {
          seen.add(doc.text);
          unique.push(doc);
        }
      }
      searchResults = unique.slice(0, 30);
    }
    
    if (!rewriteDone) {
      rewriteAbortController.abort();
    }
    clearTimeout(rewriteTimeoutId);
    logger.info({ docCount: searchResults.length, parallel: true }, 'Vector search completed (parallel path)');
  } else {
    let finalQueryForSearch = [query];
    try {
      finalQueryForSearch = await rewriteQuery(query, historyContext, pageContext, rewriteAbortController.signal);
    } catch (e) {
      if (session.messages.length >= 2) {
        const lastBotMsg = session.messages[session.messages.length - 1].text;
        const stopWords = new Set(["that", "this", "with", "from", "your", "what", "will", "have", "there", "about", "would", "could"]);
        const words = lastBotMsg.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
        const keywords = words.filter(w => w.length > 3 && !stopWords.has(w)).slice(0, 3);
        if (keywords.length > 0) {
          finalQueryForSearch = [keywords.join(" ") + " " + query];
        } else {
          finalQueryForSearch = [query];
        }
      } else {
        finalQueryForSearch = [query];
      }
    } finally {
      clearTimeout(rewriteTimeoutId);
    }
    searchResults = await vectorSearch(finalQueryForSearch, 30);
    logger.info({ queries: finalQueryForSearch, docCount: searchResults.length, parallel: false }, 'Vector search completed (sequential path)');
  }

  const responseData = await generateRAGResponse(query, searchResults, historyContext, onToken, abortSignal);
  responseData.sessionId = sessionId;
  
  return responseData;
}
