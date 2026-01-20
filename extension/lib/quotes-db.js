/**
 * Local Quotes Database
 * Loads quotes from JSON for easy editing and updates
 */

let QUOTES_DB = [];
let quotesLoaded = false;

/**
 * Load quotes from JSON file
 * Called once on service worker startup
 */
async function loadQuotes() {
  if (quotesLoaded) return QUOTES_DB;

  try {
    const response = await fetch(chrome.runtime.getURL("data/quotes.json"));
    const data = await response.json();
    QUOTES_DB = data.quotes || [];
    quotesLoaded = true;
    console.log(`[Musing] Loaded ${QUOTES_DB.length} quotes from local database`);
  } catch (error) {
    console.error("[Musing] Failed to load quotes:", error);
    // Fallback to empty - will use hardcoded fallbacks
    QUOTES_DB = [];
  }

  return QUOTES_DB;
}

/**
 * Ensure quotes are loaded before use
 */
async function ensureQuotesLoaded() {
  if (!quotesLoaded) {
    await loadQuotes();
  }
  return QUOTES_DB;
}

/**
 * Find quotes matching given themes
 * @param {string[]} themes - Array of theme names to match
 * @param {number} count - Number of quotes to return
 * @returns {Promise<Object[]>} Array of matching quotes
 */
async function findQuotesByThemes(themes, count = 5) {
  const quotes = await ensureQuotesLoaded();

  if (!themes || themes.length === 0 || quotes.length === 0) {
    // Return random quotes if no themes
    return shuffleArray([...quotes]).slice(0, count);
  }

  const normalizedThemes = themes.map(t => t.toLowerCase());

  // Score quotes by theme overlap
  const scoredQuotes = quotes.map(quote => {
    const matchCount = quote.themes.filter(t =>
      normalizedThemes.includes(t.toLowerCase())
    ).length;
    return { quote, score: matchCount };
  });

  // Filter quotes with at least one match, sort by score
  const matchingQuotes = scoredQuotes
    .filter(sq => sq.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(sq => sq.quote);

  // If we have matching quotes, return them (with some randomization)
  if (matchingQuotes.length > 0) {
    // Take top matches but shuffle within score groups for variety
    const topMatches = matchingQuotes.slice(0, Math.min(count * 2, matchingQuotes.length));
    return shuffleArray(topMatches).slice(0, count);
  }

  // Fallback to random quotes
  return shuffleArray([...quotes]).slice(0, count);
}

/**
 * Get a single random quote, optionally matching themes
 * @param {string[]} themes - Optional themes to match
 * @param {string[]} excludeIds - Quote IDs to exclude (recently shown)
 * @returns {Promise<Object>} A quote object
 */
async function getRandomQuote(themes = [], excludeIds = []) {
  const quotes = await ensureQuotesLoaded();

  let candidates = themes.length > 0
    ? await findQuotesByThemes(themes, 10)
    : [...quotes];

  // Exclude recently shown quotes
  if (excludeIds.length > 0) {
    candidates = candidates.filter(q => !excludeIds.includes(q.id));
  }

  // If all filtered out, reset
  if (candidates.length === 0) {
    candidates = [...quotes];
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Shuffle array using Fisher-Yates algorithm
 */
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Get total number of quotes in database
 */
async function getQuoteCount() {
  const quotes = await ensureQuotesLoaded();
  return quotes.length;
}

// Load quotes immediately when script loads
loadQuotes();
