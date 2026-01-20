/**
 * Local Theme Extraction Module
 * Extracts themes from conversation text using keyword matching
 * Fully local - no network requests
 */

const THEME_KEYWORDS = {
  // Technical
  programming: [
    "code", "coding", "program", "software", "developer", "function", "variable",
    "algorithm", "api", "database", "frontend", "backend", "javascript", "python",
    "typescript", "react", "node", "git", "deploy", "server", "client", "html", "css"
  ],
  debugging: [
    "debug", "bug", "error", "fix", "issue", "problem", "broken", "crash", "exception",
    "stack trace", "console", "log", "breakpoint", "test", "failing"
  ],
  architecture: [
    "architecture", "design pattern", "system", "infrastructure", "scalable", "microservice",
    "monolith", "api design", "database design", "schema", "structure"
  ],
  algorithms: [
    "algorithm", "data structure", "complexity", "big o", "sort", "search", "tree",
    "graph", "hash", "recursion", "dynamic programming", "optimization"
  ],

  // Learning & Growth
  learning: [
    "learn", "learning", "study", "understand", "knowledge", "education", "course",
    "tutorial", "practice", "improve", "skill", "beginner", "advanced", "teach"
  ],
  growth: [
    "grow", "growth", "improve", "better", "progress", "develop", "evolve", "change",
    "transform", "journey", "path", "milestone"
  ],

  // Emotional
  frustration: [
    "frustrat", "annoy", "stuck", "confused", "difficult", "hard", "struggle",
    "can't", "won't work", "doesn't work", "hate", "ugh", "argh"
  ],
  curiosity: [
    "curious", "wonder", "interesting", "fascinate", "explore", "discover", "why",
    "how does", "what if", "learn more"
  ],
  excitement: [
    "excit", "amazing", "awesome", "cool", "love", "great", "fantastic", "finally",
    "worked", "success", "yes", "perfect"
  ],
  anxiety: [
    "worr", "anxious", "stress", "nervous", "afraid", "fear", "deadline", "pressure",
    "overwhelm", "panic", "uncertain"
  ],

  // Life
  career: [
    "career", "job", "work", "profession", "interview", "resume", "salary", "promotion",
    "manager", "team", "company", "startup", "business", "entrepreneur"
  ],
  relationships: [
    "relationship", "friend", "family", "partner", "colleague", "team", "collaborate",
    "communicate", "trust", "support"
  ],
  health: [
    "health", "sleep", "exercise", "mental", "wellness", "tired", "energy", "burnout",
    "balance", "rest", "meditat"
  ],
  finance: [
    "money", "finance", "budget", "invest", "save", "cost", "price", "expensive",
    "afford", "income", "salary"
  ],

  // Abstract
  persistence: [
    "persist", "persever", "keep going", "don't give up", "continue", "endure",
    "resilient", "determined", "committed", "dedication"
  ],
  patience: [
    "patient", "patience", "wait", "time", "slow", "gradual", "eventually", "calm",
    "steady", "pace"
  ],
  simplicity: [
    "simple", "simplify", "minimal", "clean", "clear", "elegant", "straightforward",
    "basic", "essential", "reduce"
  ],
  complexity: [
    "complex", "complicated", "intricate", "nuance", "subtle", "layered", "deep",
    "sophisticated"
  ],
  wisdom: [
    "wisdom", "wise", "insight", "perspective", "understand", "realize", "lesson",
    "experience", "knowledge", "truth"
  ],

  // Work & Productivity
  productivity: [
    "productive", "productivity", "efficient", "focus", "distract", "procrastinat",
    "todo", "task", "organize", "priorit", "time management"
  ],
  motivation: [
    "motivat", "inspire", "drive", "passion", "purpose", "goal", "ambition", "dream",
    "aspir", "determination"
  ],

  // Writing & Creativity
  writing: [
    "writ", "essay", "article", "blog", "document", "draft", "edit", "publish",
    "content", "copy", "story", "narrative"
  ],
  creativity: [
    "creativ", "idea", "brainstorm", "innovate", "imagine", "design", "art", "create",
    "original", "unique", "inventive"
  ],

  // Decision Making
  "decision-making": [
    "decide", "decision", "choice", "choose", "option", "alternative", "tradeoff",
    "pros and cons", "evaluate", "assess", "weigh"
  ],
  uncertainty: [
    "uncertain", "unsure", "doubt", "maybe", "perhaps", "risk", "unknown", "unclear",
    "ambiguous", "unpredictable"
  ],

  // Problem Solving
  "problem-solving": [
    "solve", "solution", "problem", "challenge", "approach", "strategy", "method",
    "tackle", "address", "resolve", "figure out"
  ],

  // Success & Failure
  success: [
    "success", "succeed", "achieve", "accomplish", "win", "goal", "milestone",
    "breakthrough", "victory"
  ],
  failure: [
    "fail", "failure", "mistake", "wrong", "error", "setback", "loss", "defeat",
    "disappooint"
  ],

  // Time
  time: [
    "time", "hour", "minute", "day", "week", "month", "year", "deadline", "schedule",
    "late", "early", "soon", "eventually"
  ],

  // Communication
  communication: [
    "communicat", "explain", "clarify", "discuss", "talk", "conversation", "feedback",
    "listen", "understand", "express"
  ],

  // Change
  change: [
    "change", "adapt", "adjust", "transition", "transform", "shift", "evolve",
    "different", "new", "update"
  ],

  // Philosophy
  philosophy: [
    "meaning", "purpose", "exist", "life", "death", "consciousness", "reality",
    "truth", "ethics", "moral", "value"
  ],

  // Courage & Fear
  courage: [
    "courage", "brave", "bold", "confident", "fearless", "risk", "dare", "venture",
    "stand up"
  ],
  fear: [
    "fear", "afraid", "scared", "terrif", "dread", "phobia", "worry", "anxious"
  ]
};

/**
 * Extract themes from text using keyword matching
 * @param {string} text - The conversation text to analyze
 * @param {number} maxThemes - Maximum number of themes to return (default: 5)
 * @returns {string[]} Array of extracted theme names
 */
function extractThemes(text, maxThemes = 5) {
  if (!text || typeof text !== "string") {
    return [];
  }

  const normalizedText = text.toLowerCase();
  const themeScores = {};

  // Score each theme based on keyword matches
  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
    let score = 0;

    for (const keyword of keywords) {
      // Use word boundary matching for more accuracy
      const regex = new RegExp(`\\b${keyword}`, "gi");
      const matches = normalizedText.match(regex);
      if (matches) {
        score += matches.length;
      }
    }

    if (score > 0) {
      themeScores[theme] = score;
    }
  }

  // Sort themes by score and return top N
  const sortedThemes = Object.entries(themeScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxThemes)
    .map(([theme]) => theme);

  // If no themes found, return some defaults
  if (sortedThemes.length === 0) {
    return ["learning", "growth"];
  }

  return sortedThemes;
}

/**
 * Get all available theme names
 * @returns {string[]} Array of all theme names
 */
function getAllThemes() {
  return Object.keys(THEME_KEYWORDS);
}

// Export for use in extension
if (typeof module !== "undefined" && module.exports) {
  module.exports = { extractThemes, getAllThemes, THEME_KEYWORDS };
}
