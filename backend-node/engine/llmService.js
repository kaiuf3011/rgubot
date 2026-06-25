import { encodingForModel } from "js-tiktoken";
// import tracer from 'dd-trace';
const tracer = { trace: (name, cb) => cb({ setTag: () => {}, finish: () => {} }), startSpan: () => ({ finish: () => {} }) };
import { logger } from '../src/utils/logger.js';
import { LLMProvider, FallbackProvider } from '../llm-providers/index.js';
import { getRewriteQueryPrompt, getBasePromptTemplate, getFinalRAGPrompt } from './prompts.js';

const enc = encodingForModel("gpt-3.5-turbo");
const MAX_PROMPT_TOKENS = 6000;
// Documents with a cosine similarity score below this threshold are too weakly
// related to the query and are excluded from the LLM prompt to prevent
// confusing or misleading the model. 0.4 is a conservative but effective cutoff.
const MIN_RELEVANCE_SCORE = 0.4;

export function extractPartialAnswer(jsonStr) {
  const match = jsonStr.match(/"answer"\s*:\s*"/);
  if (!match) {
    const cleanStr = jsonStr.trim();
    if (cleanStr.length > 10 && !cleanStr.startsWith('{') && !cleanStr.startsWith('```')) {
      return cleanStr;
    }
    return "";
  }
  let content = jsonStr.slice(match.index + match[0].length);
  
  let endIdx = -1;
  let isEscaped = false;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\\' && !isEscaped) {
      isEscaped = true;
    } else if (content[i] === '"' && !isEscaped) {
      endIdx = i;
      break;
    } else {
      isEscaped = false;
    }
  }
  if (endIdx !== -1) {
    content = content.slice(0, endIdx);
  } else {
    // If the stream ends in a partial escape sequence (e.g., a single backslash),
    // truncate it so we don't emit broken partial characters to the frontend.
    if (isEscaped) {
      content = content.slice(0, -1);
    }
  }
  
  // Strip unescaped control characters before parse
  content = content.replace(/[\u0000-\u001F]/g, "");

  try {
    return JSON.parse('"' + content + '"');
  } catch (e) {
    return content.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
}

// signal: optional AbortSignal — when provided, the Ollama fetch will be
// cancelled if the signal fires (e.g. when the outer timeout wins the race).
export async function rewriteQuery(query, historyContext, pageContext = "", signal = null) {
  return tracer.trace('rag.rewrite_query', async () => {
    
    let historyStr = "";
    if (Array.isArray(historyContext)) {
      if (historyContext.length > 0) {
        historyStr = historyContext.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n');
      }
    } else if (typeof historyContext === 'string') {
      historyStr = historyContext;
    }

    const prompt = getRewriteQueryPrompt(historyStr, pageContext, query);

    try {
      const raw = await LLMProvider.generateJSON(prompt, signal);
      if (!raw) throw new Error("Empty response from Primary");
      return _parseQueryJSON(raw, query);
    } catch (e) {
      if (e.name !== 'AbortError') {
        logger.warn({ err: e.message || e }, "Primary LLM failed rewriteQuery, attempting FallbackProvider...");
        try {
          const rawFallback = await FallbackProvider.generateJSON(prompt, signal);
          if (!rawFallback) throw new Error("Empty response from Fallback");
          return _parseQueryJSON(rawFallback, query);
        } catch (fallbackError) {
          logger.warn({ err: fallbackError.message || fallbackError }, "Fallback LLM failed rewriteQuery, running local heuristic expansion");
        }
      }
      
      // Local Heuristic Fallback Expansion
      let pq = query.toLowerCase();
      pq = pq.replace(/\bb\.?e\.?\b/gi, "Bachelor of Engineering");
      pq = pq.replace(/\bb\.?tech\.?\b/gi, "Bachelor of Technology");
      pq = pq.replace(/\bcse\b/gi, "Computer Science and Engineering");
      pq = pq.replace(/\bece\b/gi, "Electronics and Communication Engineering");
      pq = pq.replace(/\beee\b/gi, "Electrical and Electronics Engineering");
      pq = pq.replace(/\baiml\b/gi, "Artificial Intelligence and Machine Learning");
      pq = pq.replace(/\bai&ds\b/gi, "Artificial Intelligence and Data Science");
      pq = pq.replace(/\baids\b/gi, "Artificial Intelligence and Data Science");
      pq = pq.replace(/\bit\b/gi, "Information Technology");
      pq = pq.replace(/\bhod\b/gi, "Head of Department");
      pq = pq.replace(/\bcoe\b/gi, "Controller of Examinations");
      pq = pq.replace(/\brgu\b/gi, "Rathinam Group of Institutions");
      pq = pq.replace(/\br-smart\b/gi, "Rathinam");

      return [pq];
    }
  });
}

function _parseQueryJSON(raw, originalQuery) {
  try {
    let cleanRaw = raw.trim();
    if (cleanRaw.startsWith('```json')) cleanRaw = cleanRaw.slice(7);
    else if (cleanRaw.startsWith('```')) cleanRaw = cleanRaw.slice(3);
    if (cleanRaw.endsWith('```')) cleanRaw = cleanRaw.slice(0, -3);
    cleanRaw = cleanRaw.trim();
    
    const parsed = JSON.parse(cleanRaw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    } else if (parsed && typeof parsed === "object" && Array.isArray(parsed.queries)) {
      return parsed.queries;
    }
  } catch (parseError) {
    logger.warn({ raw }, "Failed to parse decomposed query JSON, falling back to original");
  }
  return [originalQuery];
}





function cleanOutputText(text) {
  if (!text) return "";
  let cleaned = text;
  
  // Banned AI and robotic phrases cleanup
  const BANNED_PHRASES = [
    "based on the context",
    "based on context",
    "according to the provided information",
    "according to provided information",
    "according to the data",
    "i'll help you with that",
    "i will help you with that",
    "let me help you",
    "i'd be happy to help",
    "here's what i found",
    "based on my knowledge",
    "as per the information",
    "from the given context",
    "the context mentions",
    "based on available information",
    "i can see that",
    "it appears that",
    "the data suggests",
    "as mentioned in",
    "from what i can see",
    "I found information",
    "Based on the database",
    "University details retrieved",
    "I am looking at the files",
    "Let me search",
    "according to the system"
  ];
  
  for (const phrase of BANNED_PHRASES) {
    const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    cleaned = cleaned.replace(regex, "");
  }
  
  // Remove leftover JSON paths (like "placement > averagePackage > estimatedRange > technologyPrograms:")
  cleaned = cleaned.replace(/[a-zA-Z0-9_\s-]+(\s*>\s*[a-zA-Z0-9_\s-]+)+:\s*/g, "");
  
  // Clean up resulting spaces and double periods
  cleaned = cleaned
    .replace(/^[\s,.\-:]+/, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\.\s*\./g, ".")
    .trim();
  
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned;
}

export function buildFallbackHeuristicResponse(query, searchResults) {
  const lowerQuery = query.toLowerCase();
  
  // Extract structured programs
  const programs = [];
  const bulletPoints = [];
  const placementFacts = {};
  const eligibilityFacts = [];
  const generalFacts = [];

  if (searchResults && searchResults.length > 0) {
    for (const doc of searchResults) {
      const text = doc.text || doc.item?.text || "";
      if (!text) continue;

      const lines = text.split('\n');
      let currentProgram = null;

      for (const line of lines) {
        const cleanLine = line.trim();
        if (cleanLine.startsWith('- ')) {
          bulletPoints.push(cleanLine.slice(2));
        } else if (cleanLine.toLowerCase().startsWith('program:')) {
          const name = cleanLine.slice(8).trim();
          currentProgram = { name, duration: '', focusAreas: [], careerPaths: [] };
          programs.push(currentProgram);
        } else if (cleanLine.toLowerCase().startsWith('duration:') && currentProgram) {
          currentProgram.duration = cleanLine.slice(9).trim();
        } else if (cleanLine.toLowerCase().startsWith('focusareas:') && currentProgram) {
          currentProgram.focusAreas = cleanLine.slice(11).split(',').map(s => s.trim());
        } else if (cleanLine.toLowerCase().startsWith('careerpaths:') && currentProgram) {
          currentProgram.careerPaths = cleanLine.slice(12).split(',').map(s => s.trim());
        } else if (cleanLine.toLowerCase().includes('eligibility:')) {
          eligibilityFacts.push(cleanLine.split('eligibility:')[1].trim());
        } else if (cleanLine.toLowerCase().includes('eligibility >') || cleanLine.toLowerCase().includes('eligibility:')) {
          eligibilityFacts.push(cleanLine);
        } else {
          // General text
          const match = cleanLine.match(/^(highestpackage|averagepackage|medianpackage|placementrate):\s*(.*)$/i);
          if (match) {
            placementFacts[match[1].toLowerCase()] = match[2].trim();
          } else if (cleanLine && !cleanLine.includes('Rathinam RGU R-Smart') && !cleanLine.includes('---')) {
            generalFacts.push(cleanLine);
          }
        }
      }
    }
  }

  // Deduplicate programs by name
  const uniquePrograms = [];
  const seenNames = new Set();
  for (const p of programs) {
    if (!seenNames.has(p.name.toLowerCase())) {
      seenNames.add(p.name.toLowerCase());
      uniquePrograms.push(p);
    }
  }

  // Deduplicate bullet points
  const uniqueBullets = Array.from(new Set(bulletPoints));

  let answer = "";
  let highlights = [];
  let suggestions = [];

  // Heuristic routing based on query keywords
  const isCourseQuery = ["course", "program", "offer", "btech", "be", "bsc", "bcom", "mba", "mca", "bca", "bba", "list", "what are", "branch", "specialization"].some(k => lowerQuery.includes(k));
  const isPlacementQuery = ["placement", "salary", "package", "job", "placed", "recruit", "career"].some(k => lowerQuery.includes(k));
  const isEligibilityQuery = ["eligibility", "admission", "requirements", "criteria", "apply", "eligible"].some(k => lowerQuery.includes(k));

  let prependMessage = "";
  if (lowerQuery.startsWith("do you") || lowerQuery.startsWith("is there") || lowerQuery.startsWith("does rgu") || lowerQuery.startsWith("can i")) {
    const queryTerms = ["cyber", "food", "fashion", "agri", "data science", "ai", "artificial intelligence", "mba", "bba"];
    const matchedTerm = queryTerms.find(t => lowerQuery.includes(t));
    if (matchedTerm) {
      const hasMatch = uniquePrograms.some(p => p.name.toLowerCase().includes(matchedTerm) || p.focusAreas.some(f => f.toLowerCase().includes(matchedTerm)));
      if (hasMatch) {
        prependMessage = `Yes, RGU offers programs with a focus on ${matchedTerm.toUpperCase()}! `;
      }
    }
  }

  if (isCourseQuery && uniquePrograms.length > 0) {
    answer = prependMessage || "RGU offers the following specialized programs:\n";
    if (prependMessage) {
      answer += "\nHere is the list of relevant programs:\n";
    }
    for (const p of uniquePrograms) {
      let desc = `- **${p.name}**`;
      if (p.duration) desc += ` (${p.duration})`;
      if (p.focusAreas && p.focusAreas.length > 0) {
        desc += ` — Focus: ${p.focusAreas.slice(0, 3).join(', ')}`;
      }
      answer += desc + "\n";
    }
    
    if (eligibilityFacts.length > 0) {
      const cleanElig = eligibilityFacts[0].replace(/^.*undergraduate > \w+:\s*/i, "").replace(/^.*eligibility:\s*/i, "");
      answer += `\nEligibility: ${cleanElig}`;
    }

    highlights = [
      `${uniquePrograms.length} specialized programs`,
      "Industry-integrated syllabus",
      "Emerging technology focus"
    ];
    suggestions = [
      "What are the eligibility criteria for these programs?",
      "What are the placement opportunities for these courses?",
      "Do they offer any scholarships?"
    ];
  } else if (isPlacementQuery && (Object.keys(placementFacts).length > 0 || uniqueBullets.length > 0)) {
    answer = "RGU has a stellar placement record. Here are the key placement highlights:\n";
    if (placementFacts.highestpackage) {
      answer += `- **Highest Package**: ${placementFacts.highestpackage}\n`;
    }
    if (placementFacts.averagepackage) {
      answer += `- **Average Package**: ${placementFacts.averagepackage}\n`;
    }
    if (placementFacts.placementrate) {
      answer += `- **Placement Rate**: ${placementFacts.placementrate}\n`;
    }
    
    const rolesList = uniqueBullets.filter(b => b.toLowerCase().includes('engineer') || b.toLowerCase().includes('developer') || b.toLowerCase().includes('analyst') || b.toLowerCase().includes('manager'));
    if (rolesList.length > 0) {
      answer += `\nCommon career paths and roles include: ${rolesList.slice(0, 5).join(', ')}.`;
    }

    highlights = [
      "Top placement records",
      placementFacts.highestpackage ? `Highest: ${placementFacts.highestpackage}` : "High packages",
      placementFacts.placementrate ? `Rate: ${placementFacts.placementrate}` : "Multi-industry roles"
    ];
    suggestions = [
      "Which companies recruit from RGU?",
      "What is the average package for technology programs?",
      "How are students prepared for placements?"
    ];
  } else if (isEligibilityQuery && (eligibilityFacts.length > 0 || generalFacts.length > 0)) {
    const rawElig = eligibilityFacts.length > 0 ? eligibilityFacts[0] : (generalFacts.length > 0 ? generalFacts[0] : "");
    const cleanElig = rawElig.replace(/^.*undergraduate > \w+:\s*/i, "").replace(/^.*eligibility:\s*/i, "");
    answer = `Here are the eligibility and admission requirements: ${cleanElig}`;
    
    highlights = [
      "Clear eligibility rules",
      "Direct admission pathways"
    ];
    suggestions = [
      "How can I apply for admission?",
      "What is the RSTNAT exam?",
      "Are there any scholarship criteria?"
    ];
  } else {
    // General fallback: collect and format retrieved facts
    if (uniqueBullets.length > 0) {
      answer = "Here is some information about RGU related to your query:\n";
      for (const bullet of uniqueBullets.slice(0, 5)) {
        answer += `- ${bullet}\n`;
      }
    } else if (generalFacts.length > 0) {
      answer = generalFacts.slice(0, 3).join(" ");
    } else {
      answer = "I don't have that specific information in my knowledge base right now. For more details or clearing more queries, please contact Raise Smart admissions at +91 84484 48909. Could you please rephrase or ask about admissions, courses, placements, or campus life at RGU?";
    }

    highlights = [
      "RGU general guidelines",
      "Practical study approach"
    ];
    suggestions = [
      "What are the engineering programs at RGU?",
      "Tell me about the campus facilities.",
      "How can I contact admissions?"
    ];
  }

  return {
    answer,
    highlights,
    suggestions,
    intent: "rag_fallback_heuristic"
  };
}

export async function generateRAGResponse(query, searchResults, historyContext, onToken = null, signal = null) {
  return tracer.trace('rag.generate_response', async (span) => {
    span.setTag('documents.count', searchResults ? searchResults.length : 0);

    let historyStr = "";
    if (Array.isArray(historyContext)) {
      if (historyContext.length > 0) {
        historyStr = historyContext.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n');
        const tokens = enc.encode(historyStr).length;
        if (tokens > 400) {
          const firstUserTurn = historyContext.find(m => m.role === 'user')?.text || "";
          const stopWords = new Set(["the", "and", "that", "this", "have", "with", "from", "about", "what", "tell", "please", "could", "would"]);
          const words = firstUserTurn.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
          const keywords = words.filter(w => w.length > 3 && !stopWords.has(w)).slice(0, 3).join(" ");
          const truncated = historyContext.slice(-6); // last 3 turns
          historyStr = `(Earlier: user asked about ${keywords})\n` + truncated.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n');
        }
      }
    } else if (typeof historyContext === 'string') {
      historyStr = historyContext;
    }

    const basePromptTemplate = getBasePromptTemplate(historyStr, query);
    
    let currentTokens = enc.encode(basePromptTemplate).length;
    let contextStr = "RETRIEVED KNOWLEDGE BASE DOCUMENTS:\n";
    let docsUsed = 0;

    if (searchResults && searchResults.length > 0) {
      // Filter out low-relevance documents. ChromaDB returns cosine similarity
      // scores where 1.0 = identical and 0.0 = unrelated. Documents below
      // MIN_RELEVANCE_SCORE provide noise rather than signal to the LLM.
      // If filtering eliminates everything (unusual), fall back to all results
      // so the model is never left with an empty context on a valid query.
      const relevantDocs = searchResults.filter(
        (doc) => typeof doc.score !== 'number' || doc.score >= MIN_RELEVANCE_SCORE
      );
      const docsToUse = relevantDocs.length > 0 ? relevantDocs : searchResults;

      if (relevantDocs.length < searchResults.length) {
        logger.info(
          { total: searchResults.length, kept: docsToUse.length },
          'Low-relevance documents filtered out'
        );
      }

      for (const doc of docsToUse) {
        const rawContent = doc.text || doc.item?.text || JSON.stringify(doc);
        const content = rawContent.replace(/\s*>\s*/g, " ");
        const docString = `--- Information Snippet ---\n${content}\n`;
        const docTokens = enc.encode(docString).length;

        if (currentTokens + docTokens > MAX_PROMPT_TOKENS) {
          logger.warn("Context token limit reached, skipping remaining documents.");
          break;
        }

        contextStr += docString;
        currentTokens += docTokens;
        docsUsed++;
      }
    } else {
      contextStr += "(No documents found)\n";
    }

    const prompt = getFinalRAGPrompt(contextStr, historyContext, query);

    const ttftSpan = tracer.startSpan('llm.time_to_first_token', { childOf: span });
    let isFirstToken = true;
    const startTime = Date.now();

    try {
      let accumulatedJson = "";
      let answerExtracted = "";

      const generateCallback = (tokenChunk) => {
        accumulatedJson; // referenced to avoid lint warning
        const currentAnswer = extractPartialAnswer(accumulatedJson + tokenChunk);
        if (currentAnswer && currentAnswer.length > answerExtracted.length && onToken) {
          if (isFirstToken) {
            ttftSpan.finish();
            logger.info({ ttft: Date.now() - startTime }, 'First token generated');
            isFirstToken = false;
          }
          const newTokens = currentAnswer.slice(answerExtracted.length);
          onToken(newTokens);
          answerExtracted = currentAnswer;
        }
      };

      try {
        accumulatedJson = await LLMProvider.generate(prompt, generateCallback, signal);
      } catch (primaryError) {
        logger.warn({ err: primaryError.message || primaryError, provider: LLMProvider.name }, "Primary LLM RAG generate error. Attempting FallbackProvider...");
        accumulatedJson = await FallbackProvider.generate(prompt, generateCallback, signal);
      }

      try {
        let cleanJson = accumulatedJson.trim();
        if (cleanJson.startsWith('```json')) cleanJson = cleanJson.slice(7);
        else if (cleanJson.startsWith('```')) cleanJson = cleanJson.slice(3);
        if (cleanJson.endsWith('```')) cleanJson = cleanJson.slice(0, -3);
        cleanJson = cleanJson.trim();
        
        const parsed = JSON.parse(cleanJson);
        const answer = cleanOutputText(parsed.answer || answerExtracted || "I couldn't find that information.");
        const highlights = (parsed.highlights || []).map(h => cleanOutputText(h)).filter(h => h.length > 0);
        const suggestions = (parsed.suggestions || []).map(s => cleanOutputText(s)).filter(s => s.length > 0);
        return {
          answer,
          highlights,
          suggestions,
          intent: "rag_response"
        };
      } catch (parseError) {
        logger.error({ err: parseError, accumulatedJson }, "Failed to parse LLM JSON");
        return {
          answer: cleanOutputText(answerExtracted || accumulatedJson),
          highlights: [],
          suggestions: [],
          intent: "rag_response_fallback"
        };
      }
    } catch (error) {
      logger.error({ err: error.message || error, provider: FallbackProvider.name }, "Fallback LLM RAG generate error. Routing to local heuristic fallback...");
      const fallbackRes = buildFallbackHeuristicResponse(query, searchResults);
      if (onToken && fallbackRes.answer) {
        const words = fallbackRes.answer.split(' ');
        for (const word of words) {
          onToken(word + ' ');
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      return fallbackRes;
    }
  });
}
