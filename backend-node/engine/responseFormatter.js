/**
 * Response Formatter — Academic Advisor Persona for RGU
 * 
 * SYSTEM PROMPT PRINCIPLES:
 * - You are an enthusiastic, helpful academic advisor for RGU
 * - Answer ONLY what the student specifically asks about — don't list unrelated programs
 * - Use warm, encouraging, welcoming tone in every interaction
 * - NEVER hallucinate or guess — only use knowledge base data
 * - If info is missing, offer to connect with an advisor (never apologize)
 * - Frame every response positively
 * 
 * Formatting Rules:
 * 1. Strip all AI-like phrasing
 * 2. Max 2-4 lines for the answer
 * 3. Extract key highlights (max 4 bullets)
 * 4. Generate 3-4 follow-up suggestions (randomized, curiosity-driven)
 * 5. Never dump paragraphs or list unrelated programs
 */

// Phrases to strip from responses
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
];

// Category → emoji mapping
const CATEGORY_EMOJIS = {
  placement: "",
  salary: "",
  course: "",
  program: "",
  admission: "",
  scholarship: "",
  rstnat: "",
  hostel: "",
  campus: "",
  facility: "",
  ai: "",
  engineering: "",
  mba: "",
  career: "",
  culture: "",
  sport: "",
  transport: "",
  food: "",
  library: "",
  default: "",
};

// Suggestion pools by category
const SUGGESTION_MAP = {
  placement: ["Who recruits?", "Highest package?", "Do I get trained?", "Any FAANG offers?", "Average salary?", "Placement stats?", "How to get placed?", "Do startups visit?"],
  placements_salary: ["Top recruiters?", "What's the max package?", "Placement tips?", "Are internships given?", "What's the average package?", "Who are the bulk hirers?", "How's the placement rate?", "Does RGU guarantee jobs?"],
  course: ["Which is best: CSE or IT?", "Tell me about MBA", "Are there scholarships?", "How to get admitted?", "What are the fees?", "Are there PG courses?", "Any non-math courses?", "What about BBA?"],
  programme: ["Top B.Tech branches?", "What's in MBA?", "Any B.Sc options?", "What about BCA?", "Any AI programs?", "Do you have Data Science?", "Any cybersecurity courses?", "Is there B.Com?"],
  admission: ["Can I get a scholarship?", "What documents do I need?", "Show me the degrees", "How do I apply?", "What's the eligibility?", "Is there lateral entry?", "What's the admission process?"],
  fee_redirect: ["Tell me about degrees", "Can I get a scholarship?", "How are placements?", "How's the campus vibe?", "Are fees affordable?", "Any fee waivers?", "What about hostel fees?", "Are there education loans?"],
  scholarship: ["How much scholarship?", "How do I apply?", "Are there fee waivers?", "Who is eligible?", "Is there 100% scholarship?", "When is the test?"],
  hostel: ["Are AC rooms available?", "How is the food?", "What are the facilities?", "How's the campus vibe?", "Is it safe?", "Are there gym facilities?", "Is there laundry?", "Can I stay off-campus?"],
  campus: ["Are the labs high-tech?", "Can I play sports?", "Is there a library?", "Are there buses?", "How's the infrastructure?", "Are there coding clubs?", "What about events?", "Is Wi-Fi available?"],
  facility: ["Computer labs?", "Is the library good?", "What about sports?", "Food & cafeterias?", "Are there medical facilities?", "Is there an ATM?", "How's the gym?", "Are there smart classes?"],
  ai: ["Why study AI?", "Is AI the future?", "What AI tools are taught?", "AI Placements?", "Any AI labs?", "Who teaches AI?", "What is the AI curriculum?", "Is Data Science better?"],
  engineering: ["Best engineering branch?", "CSE vs IT?", "How are the placements?", "Can I get a scholarship?", "Is engineering hard?", "Who are the recruiters?", "What's the highest package?", "Are there practicals?"],
  mba: ["What's special about MBA?", "Is MBA worth it?", "MBA placements?", "What are the specializations?", "Is there global immersion?", "Who hires MBAs?", "Are there live projects?"],
  culture: ["How's the campus vibe?", "Any events?", "Clubs & activities?", "How is the infrastructure?", "Are there fests?", "Is there a dress code?", "What about hackathons?", "Are students friendly?"],
  clubs: ["Technical Clubs?", "Cultural Clubs?", "Entrepreneurship Clubs?", "Social Impact Clubs?", "How to join a club?", "Are there coding clubs?", "Who guides the clubs?"],
  events: ["When is the next fest?", "What is graduation day?", "Are there hackathons?", "Tell me about cultural fests", "What events happen in campus?", "Can hostellers join events?"],
  curriculum: ["What is RAALE framework?", "Are there global certs?", "Do we do mini projects?", "Tell me about internship semesters", "How practical is the syllabus?"],
  eligibility: ["Am I eligible for B.Tech?", "What is the cutoff?", "What documents are needed?", "Is there lateral entry?", "Can direct admission be done?"],
  rgu: ["Why choose RGU?", "What are the advantages?", "How are the placements?", "How to join?", "Are certifications included?"],
  higher_studies: ["Can I do M.Tech?", "MS abroad after B.Tech?", "Can I do MBA after engineering?", "Is PhD possible?", "Which PG exams to write?", "Can I go to IITs for PG?", "Is degree valid for MS?", "What about GATE prep?"],
  study_abroad: ["Which countries accept RGU degrees?", "How to apply for MS?", "Do I need GRE?", "Can I go to USA?", "Is IELTS required?", "Which universities accept this?", "How about Canada?", "Do alumni go abroad?"],
  default: ["Highest Packages?", "Why RGU?", "Is AI the future?", "Campus Vibe?", "Any scholarships?", "Top courses?", "How to apply?", "Tell me about hostels"],
};

function getRandomSuggestions(arr, count = 4) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

/**
 * Get appropriate emoji for a category
 */
function getEmoji(category) {
  const lower = (category || "").toLowerCase();
  for (const [key, emoji] of Object.entries(CATEGORY_EMOJIS)) {
    if (lower.includes(key)) return emoji;
  }
  return CATEGORY_EMOJIS.default;
}

/**
 * Get follow-up suggestions based on category/intent
 */
function getSuggestions(category, intent) {
  const key = intent || category || "";
  const lower = key.toLowerCase().replace(/\s+/g, "_");

  // Try exact match first
  if (SUGGESTION_MAP[lower]) {
    return getRandomSuggestions(SUGGESTION_MAP[lower]);
  }

  // Try partial match
  for (const [mapKey, suggestions] of Object.entries(SUGGESTION_MAP)) {
    if (lower.includes(mapKey) || mapKey.includes(lower.split("_")[0])) {
      return getRandomSuggestions(suggestions);
    }
  }

  return getRandomSuggestions(SUGGESTION_MAP.default);
}

/**
 * Clean text of banned AI phrases
 */
function cleanText(text) {
  let cleaned = text;

  for (const phrase of BANNED_PHRASES) {
    const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    cleaned = cleaned.replace(regex, "");
  }

  // Remove leftover JSON paths (like "placement > averagePackage > estimatedRange > technologyPrograms:")
  cleaned = cleaned.replace(/[a-zA-Z0-9_\s-]+(\s*>\s*[a-zA-Z0-9_\s-]+)+:\s*/g, "");

  // Clean up resulting artifacts
  cleaned = cleaned
    .replace(/^[\s,.\-:]+/, "")       // Leading punctuation
    .replace(/\s{2,}/g, " ")          // Multiple spaces
    .replace(/\.\s*\./g, ".")         // Double periods
    .trim();

  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}

/**
 * Split long text into short conversational chunks
 */
function shortenResponse(text, maxLines = 3) {
  if (!text) return "";
  if (text.length < 250) {
    return text;
  }

  // Split by sentences, avoiding splitting on common initials/abbreviations like K.B., M.E., B.Tech, Dr., etc.
  const sentences = text
    .split(/(?<!\b[A-Za-z]\.)(?<!\b[A-Za-z])(?<!\b[Dd]r\.)(?<!\b[Mm]r\.)(?<!\b[Mm]s\.)(?<!\b[Pp]rof\.)(?<!\b[Ss]r\.)(?<!\b[Jj]r\.)(?<!\b[Bb]\.?[Ee])(?<!\b[Mm]\.?[Ee])(?<!\b[Bb]\.?[Sc])(?<!\b[Mm]\.?[Sc])(?<!\b[Bb]\.?[Cc]om)(?<!\b[Mm]\.?[Cc]om)(?<!\b[Pp]h\.?[Dd])(?<!\b[Tt]ech)(?<!\b[Aa]cademic)(?<!\b[Uu]niv)(?<!\b[Cc]oE)(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 5);

  if (sentences.length <= maxLines) {
    return sentences.join(" ");
  }

  // Take first few sentences that fit
  return sentences.slice(0, maxLines).join(" ");
}

/**
 * Extract highlight points from text
 */
function extractHighlights(text, maxHighlights = 4) {
  const highlights = [];

  // Look for bullet-like patterns
  const bulletPatterns = text.match(/(?:[-•*]\s*)([^\n.]+)/g);
  if (bulletPatterns && bulletPatterns.length > 0) {
    for (const bullet of bulletPatterns.slice(0, maxHighlights)) {
      const clean = bullet.replace(/^[-•*]\s*/, "").trim();
      if (clean.length > 5 && clean.length < 100) {
        highlights.push(clean);
      }
    }
  }

  // If no bullets found, extract key phrases from sentences
  if (highlights.length === 0) {
    const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
    for (const sentence of sentences.slice(0, maxHighlights)) {
      // Shorten to key phrase
      const shortened = sentence.length > 60 ? sentence.substring(0, 57) + "..." : sentence;
      highlights.push(shortened);
    }
  }

  return highlights.slice(0, maxHighlights);
}

/**
 * Format a response for intent-matched results
 */
function formatIntentResponse(intent, responses) {
  // Pick a random response (varied answers feel more natural)
  const mainResponse = responses[Math.floor(Math.random() * Math.min(responses.length, 2))];
  const emoji = getEmoji(intent);

  // Get additional responses as highlights
  const otherResponses = responses.filter(r => r !== mainResponse);
  const highlights = otherResponses
    .slice(0, 3)
    .map(r => shortenResponse(cleanText(r), 1));

  const answer = `${cleanText(shortenResponse(mainResponse, 2))} ${emoji}`.trim();

  return {
    answer,
    response: answer,
    highlights,
    suggestions: getSuggestions(null, intent),
    intent,
  };
}

/**
 * Format a response for fuzzy search results
 */
function formatSearchResponse(results, query) {
  if (!results || results.length === 0) {
    return formatFallback();
  }

  const topResult = results[0];
  const emoji = getEmoji(topResult.category);

  // Main answer from top result
  const answer = `${cleanText(shortenResponse(topResult.text, 2))} ${emoji}`.trim();

  // Highlights from secondary results
  const highlights = results
    .slice(1, 4)
    .map(r => cleanText(shortenResponse(r.text, 1)))
    .filter(h => h.length > 5 && h.length < 120);

  // If not enough highlights, extract from top result
  if (highlights.length < 2) {
    const extracted = extractHighlights(topResult.text);
    highlights.push(...extracted.slice(0, 3 - highlights.length));
  }

  return {
    answer,
    response: answer,
    highlights: [...new Set(highlights)].slice(0, 4), // deduplicate
    suggestions: getSuggestions(topResult.category, null),
    intent: topResult.category,
  };
}

/**
 * Format a friendly fallback response — never apologize, always redirect warmly
 */
function formatFallback() {
  const fallbackAnswers = [
    "That's a great question! I want to make sure I give you the most accurate details. Let me connect you with an RGU advisor who can help — reach out at +91 84484 48909!",
    "Fantastic question! To give you the perfect answer, I'd recommend speaking with our admissions team directly at admission@rgu.ac.in — they'll have all the specifics!",
    "I love your curiosity! For the most accurate details on that, our RGU advisors would be the best resource. You can reach them at +91 84484 48909!",
  ];

  const answer = fallbackAnswers[Math.floor(Math.random() * fallbackAnswers.length)];
  return {
    answer,
    response: answer,
    highlights: [
      "Contact: +91 84484 48909",
      "Email: admission@rgu.ac.in",
    ],
    suggestions: getRandomSuggestions(SUGGESTION_MAP.default),
    intent: "fallback",
  };
}

/**
 * Main response formatter
 * @param {Object} params
 * @param {string} params.type - "intent" | "search" | "fallback"
 * @param {Object} [params.intentResult] - Intent detection result
 * @param {Array} [params.searchResults] - Fuzzy search results
 * @param {string} params.query - Original user query
 * @returns {{ answer: string, highlights: string[], suggestions: string[], intent: string }}
 */
export function formatResponse({ type, intentResult, searchResults, query }) {
  switch (type) {
    case "intent":
      return formatIntentResponse(intentResult.tag, intentResult.responses);

    case "search":
      return formatSearchResponse(searchResults, query);

    case "fallback":
    default:
      return formatFallback();
  }
}
