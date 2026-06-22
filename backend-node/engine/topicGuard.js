/**
 * Topic Guard — Pre-filter to reject off-topic queries before RAG pipeline
 *
 * Layer 1 of the strict on-topic lock system.
 * Runs BEFORE intent detection or search — fast keyword + regex check.
 *
 * Rules:
 * - If the query matches an explicit off-topic pattern → reject immediately
 * - If the query contains any RGU/Rathinam topic keyword → allow
 * - Short greetings (≤3 words) → allow (hi, hello, thanks, etc.)
 * - Longer queries with zero topic keywords → reject
 */

function getRandomSuggestions(arr, count = 4) {
  return [...arr].sort(() => 0.5 - Math.random()).slice(0, count);
}

// ─── RGU / Rathinam topic keywords ──────────────────────────────────────
// Any query containing one of these words is considered on-topic
const TOPIC_KEYWORDS = new Set([
  // Institution
  "rathinam", "rgu",
  "college", "university", "campus", "institution",
  // Academics
  "course", "courses", "program", "programme", "programs", "degree",
  "syllabus", "curriculum", "semester", "subject", "elective",
  "engineering", "btech", "b.tech", "be", "b.e",
  "mba", "bba", "bca", "bsc", "b.sc", "bcom", "b.com", "ba",
  "msc", "m.sc", "mcom", "m.com", "ma", "bpharm", "bpt", "barch",
  "cse", "ece", "eee", "it", "aids",
  "ai", "ml", "artificial", "intelligence", "machine", "learning",
  "data", "science", "cybersecurity", "cyber", "security",
  "cloud", "devops", "robotics", "biomedical",
  "ug", "pg", "undergraduate", "postgraduate", "diploma",
  // Admissions
  "admission", "admissions", "apply", "application", "enroll",
  "eligibility", "cutoff", "entrance", "seat", "intake",
  "lateral", "entry", "direct",
  // Fees & Scholarships
  "fee", "fees", "tuition", "cost", "payment", "installment",
  "scholarship", "scholarships", "waiver", "discount", "merit",
  "financial", "aid", "loan", "emi",
  // Placements
  "placement", "placements", "placed", "recruit", "recruiter",
  "recruiters", "hiring", "job", "jobs", "career", "careers",
  "salary", "package", "packages", "ctc", "lpa", "crore",
  "internship", "internships", "training",
  // Campus Life
  "hostel", "hostels", "room", "mess", "food", "canteen",
  "cafeteria", "accommodation", "boarding",
  "library", "lab", "labs", "gym", "sports", "auditorium",
  "wifi", "transport", "bus", "parking", "atm", "medical",
  "facility", "facilities", "infrastructure",
  "attendance", "dress", "code", "rules", "timing",
  "club", "clubs", "event", "events", "fest", "hackathon",
  "culture", "environment", "student", "students",
  // Exams & Academics
  "exam", "exams", "backlog", "supplementary", "reappear",
  "marks", "gpa", "cgpa", "grade", "result",
  "naac", "accreditation", "accredited",
  // People
  "faculty", "professor", "teacher", "hod", "dean",
  "alumni", "founder", "principal", "mohana", "rajan",
  "devi", "sri", "aditya", "karthick", "balashanmugam",
  "naveenkumar", "pradeep", "janani", "bennish", "christopher",
  "abdul", "rahman", "shaila", "neelofar", "madan", "senthil",
  // Study Abroad & Higher Studies
  "abroad", "gre", "gmat", "ielts", "toefl", "ms", "foreign", "higher", "studies", "studes", "masters", "mtech",
  // General education
  "study", "learn", "education", "branch", "stream",
  "specialization", "certification", "certificate",
]);

// ─── Greeting words (always allowed) ─────────────────────────────────
const GREETINGS = new Set([
  "hi", "hey", "hello", "hola", "howdy", "yo",
  "thanks", "thank", "bye", "goodbye", "ok", "okay",
  "yes", "no", "sure", "yep", "nope", "cool",
  "good", "great", "nice", "awesome", "help", "start",
  "what", "how", "tell", "show", "explain", "which", "can",
]);

// ─── Explicit off-topic patterns (fast reject) ──────────────────────
const OFF_TOPIC_PATTERNS = [
  // General knowledge / trivia
  /\b(weather|forecast|temperature|rain|climate)\b/i,
  /\b(stock|share|market|nifty|sensex|bitcoin|crypto|forex|nft)\b/i,
  /\b(movie|film|netflix|amazon prime|hotstar|song|music|singer|actor)\b/i,
  /\b(cricket|ipl|football|fifa|match|score|team|player)\b(?!.*\bcollege|campus|sports\b)/i,
  /\b(recipe|cook|food)\b(?!.*\bcollege|campus|hostel|canteen|mess\b)/i,
  /\b(politics|politician|election|vote|modi|congress|bjp)\b/i,
  /\b(dating|tinder|bumble|relationship|girlfriend|boyfriend)\b/i,

  // General purpose AI requests
  /\b(write me a|compose a|draft a|create a poem|write a story|write code)\b/i,
  /\b(translate|convert|calculate)\b(?!.*\bfee|cost|scholarship\b)/i,

  // World knowledge
  /\b(capital of|president of|prime minister|who invented|who discovered)\b/i,
  /\b(country|countries|continent|planet|solar system|universe)\b(?!.*\bcollege|campus|abroad\b)/i,

  // Tech support (not education)
  /\b(fix my|repair|broken|error in my|debug my)\b/i,
  /\b(download|install|setup|configure)\b(?!.*\bollama|app|form\b)/i,
];

// ─── Explicit inappropriate patterns (instant reject) ────────────────
const INAPPROPRIATE_PATTERNS = [
  /\b(fuck|shit|bitch|asshole|cunt|dick|pussy|whore|slut|cock|porn|sex|idiot|stupid|dumb)\b/i,
];

/**
 * Check if a user query is on-topic for RGU/Rathinam
 * @param {string} query - The user's message
 * @param {boolean} [hasHistory=false] - Whether the user has session history
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function checkTopic(query, hasHistory = false) {
  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();
  
  // Check explicit inappropriate patterns first (instant reject)
  for (const pattern of INAPPROPRIATE_PATTERNS) {
    if (pattern.test(lower)) {
      return { allowed: false, reason: "inappropriate" };
    }
  }

  const words = lower.split(/\s+/).filter(w => w.length > 0);

  // Empty query
  if (words.length === 0) {
    return { allowed: false, reason: "empty" };
  }

  // Short messages (≤3 words) — greetings, yes/no, etc.
  if (words.length <= 3) {
    // If we have history, allow it to pass through to be handled by follow-up logic/search
    if (hasHistory) {
      return { allowed: true };
    }

    // Otherwise (no history), check if it's a greeting
    if (isGreeting(trimmed) || words.some(w => GREETINGS.has(w.replace(/[^a-z]/g, "")))) {
      return { allowed: true };
    }

    // If not a greeting, it must contain at least one topic keyword
    const hasTopicKeyword = words.some(word => {
      const cleaned = word.replace(/[^a-z0-9.-]/g, "");
      if (cleaned.length < 2) return false;
      if (TOPIC_KEYWORDS.has(cleaned)) return true;
      for (const topic of TOPIC_KEYWORDS) {
        if (topic.length >= 4 && (cleaned.includes(topic) || (cleaned.length >= 4 && topic.includes(cleaned)))) {
          return true;
        }
      }
      return false;
    });

    if (hasTopicKeyword) {
      return { allowed: true };
    }

    // Short query, no history, no greeting, no topic keywords -> reject
    return { allowed: false, reason: "off_topic" };
  }

  // Check explicit off-topic patterns first (fast reject)
  for (const pattern of OFF_TOPIC_PATTERNS) {
    if (pattern.test(lower)) {
      return { allowed: false, reason: "off_topic" };
    }
  }

  // Check if ANY word matches a RGU/Rathinam topic keyword
  for (const word of words) {
    // Strip common punctuation from the word
    const cleaned = word.replace(/[^a-z0-9.-]/g, "");
    if (cleaned.length < 2) continue;

    if (TOPIC_KEYWORDS.has(cleaned)) {
      return { allowed: true };
    }

    // Also check if topic keyword is a substring (e.g., "placements" contains "placement")
    for (const topic of TOPIC_KEYWORDS) {
      if (topic.length >= 4 && (cleaned.includes(topic) || (cleaned.length >= 4 && topic.includes(cleaned)))) {
        return { allowed: true };
      }
    }
  }

  // 4+ word query with no topic match → reject
  return { allowed: false, reason: "off_topic" };
}

/**
 * Get the strict rejection response for off-topic queries
 * @returns {Object} Formatted response object
 */
export function getOffTopicResponse() {
  const answers = [
    "That's outside my area, but I'd love to help with anything about RGU! Ask me about our programs, placements, scholarships, or campus life — I've got all the details!",
    "Great curiosity! While that's outside my expertise, I'm here to help you explore everything RGU has to offer — from top programs to amazing placements!",
    "I appreciate your question! My specialty is all things RGU — programs, placements, campus life, and admissions. What would you like to explore?",
  ];
  const answer = answers[Math.floor(Math.random() * answers.length)];
  return {
    answer,
    response: answer,
    highlights: [],
    suggestions: getRandomSuggestions(["Highest Packages?", "Why RGU?", "Is AI the future?", "Campus Vibe?", "Top courses?", "Any scholarships?", "How to apply?", "Tell me about hostels"]),
    intent: "off_topic",
  };
}

/**
 * Get the response for inappropriate queries
 * @returns {Object} Formatted response object
 */
export function getInappropriateResponse() {
  const answer = "Please refrain from using inappropriate language. I'm here to help you with anything related to RGU's programs, admissions, or campus life!";
  return {
    answer,
    response: answer,
    highlights: [],
    suggestions: getRandomSuggestions(["Highest Packages?", "Why RGU?", "Top courses?", "How to apply?"]),
    intent: "inappropriate",
  };
}

/**
 * Check if a query is a simple greeting
 * @param {string} query
 * @returns {boolean}
 */
export function isGreeting(query) {
  const lower = query.trim().toLowerCase().replace(/[^a-z\s]/g, "");
  const words = lower.split(/\s+/).filter(w => w.length > 0);

  if (words.length > 3) return false;

  const greetings = new Set([
    "hi", "hey", "hello", "hola", "howdy", "yo",
    "thanks", "thank", "bye", "goodbye",
    "ok", "okay", "yes", "no", "sure", "yep", "nope",
    "good", "great", "nice", "awesome",
    "help", "start", "menu",
    "good morning", "good afternoon", "good evening",
  ]);

  // Check if the full phrase is a greeting
  if (greetings.has(lower)) return true;

  // Check if all words are greeting-like
  const greetingWords = new Set([
    "hi", "hey", "hello", "hola", "howdy", "yo",
    "good", "morning", "afternoon", "evening", "night",
    "thanks", "thank", "you", "bye", "goodbye",
    "ok", "okay", "sure", "yep", "nope",
    "help", "start", "menu", "there",
  ]);

  return words.every(w => greetingWords.has(w));
}

/**
 * Get a friendly greeting response
 * @returns {Object}
 */
export function getGreetingResponse() {
  const greetings = [
    "Hey there! 👋 Welcome to RGU! I'm your campus advisor — ask me anything about our programs, placements, scholarships, or campus life. What sparks your interest?",
    "Hello! Great to see you here! 🎓 I'm the RGU advisor, ready to help you explore your perfect academic path. What would you like to know?",
    "Welcome! 🌟 I'm here to help you discover everything RGU has to offer. Whether it's courses, placements, or campus vibes — just ask!",
  ];

  const answer = greetings[Math.floor(Math.random() * greetings.length)];

  return {
    answer,
    response: answer,
    highlights: [],
    suggestions: getRandomSuggestions(["Highest Packages?", "Why RGU?", "Is AI the future?", "Campus Vibe?", "Top courses?", "Any scholarships?", "How to apply?", "Tell me about hostels"]),
    intent: "greeting",
  };
}
