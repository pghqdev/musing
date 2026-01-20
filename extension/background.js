/**
 * Background Service Worker
 * Handles quote caching, periodic sync, and communication with content scripts
 */

const API_URL = "https://musing-api.minimalistprojects.com";
const SYNC_INTERVAL_HOURS = 24;
const MIN_CACHE_SIZE = 5;
const DEFAULT_CACHE_SIZE = 15;
const MAX_RETRY_ATTEMPTS = 3;
const MIN_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes between syncs

// Storage keys
const KEYS = {
  QUOTES: "cached_quotes",
  CONVERSATIONS: "recent_conversations",
  LAST_SYNC: "last_sync_timestamp",
  SHOWN_QUOTE_IDS: "shown_quote_ids",
  LAST_ERROR: "last_error",
  PENDING_SYNC: "pending_sync",
};

// Expanded fallback quotes for offline/error scenarios
const FALLBACK_QUOTES = [
  { id: "fallback-1", text: "The journey of a thousand miles begins with a single step.", author: "Lao Tzu" },
  { id: "fallback-2", text: "To begin, begin.", author: "William Wordsworth" },
  { id: "fallback-3", text: "The only true wisdom is in knowing you know nothing.", author: "Socrates" },
  { id: "fallback-4", text: "In the middle of difficulty lies opportunity.", author: "Albert Einstein" },
  { id: "fallback-5", text: "The mind is everything. What you think you become.", author: "Buddha" },
  { id: "fallback-6", text: "I think, therefore I am.", author: "René Descartes" },
  { id: "fallback-7", text: "The unexamined life is not worth living.", author: "Socrates" },
  { id: "fallback-8", text: "Knowledge speaks, but wisdom listens.", author: "Jimi Hendrix" },
  { id: "fallback-9", text: "The only thing we have to fear is fear itself.", author: "Franklin D. Roosevelt" },
  { id: "fallback-10", text: "Be the change you wish to see in the world.", author: "Mahatma Gandhi" },
  { id: "fallback-11", text: "Education is not the filling of a pail, but the lighting of a fire.", author: "W.B. Yeats" },
  { id: "fallback-12", text: "The greatest glory in living lies not in never falling, but in rising every time we fall.", author: "Nelson Mandela" },
  { id: "fallback-13", text: "It is not length of life, but depth of life.", author: "Ralph Waldo Emerson" },
  { id: "fallback-14", text: "Wonder is the beginning of wisdom.", author: "Socrates" },
  { id: "fallback-15", text: "The limits of my language mean the limits of my world.", author: "Ludwig Wittgenstein" },
];

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[Musing] Extension installed");

  // Set up periodic sync alarm
  chrome.alarms.create("sync-quotes", {
    periodInMinutes: SYNC_INTERVAL_HOURS * 60,
  });

  // Fetch initial generic quotes
  await fetchAndCacheQuotes("");
});

// Handle alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "sync-quotes") {
    console.log("[Musing] Periodic sync triggered");
    await syncQuotes();
  }
  if (alarm.name === "retry-sync") {
    console.log("[Musing] Retrying pending sync");
    await syncQuotes();
  }
});

// Handle online/offline events via alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "check-pending-sync") {
    const { [KEYS.PENDING_SYNC]: pending } = await chrome.storage.local.get(KEYS.PENDING_SYNC);
    if (pending) {
      console.log("[Musing] Processing pending sync after coming online");
      await syncQuotes();
    }
  }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CONVERSATION_UPDATE") {
    handleConversationUpdate(message.data);
    sendResponse({ success: true });
  }

  if (message.type === "GET_QUOTE") {
    getQuoteForDisplay().then(sendResponse);
    return true; // Async response
  }

  if (message.type === "FORCE_SYNC") {
    syncQuotes().then((result) => sendResponse(result));
    return true;
  }

  if (message.type === "GET_LAST_ERROR") {
    chrome.storage.local.get(KEYS.LAST_ERROR).then((data) => {
      sendResponse({ error: data[KEYS.LAST_ERROR] });
    });
    return true;
  }
});

/**
 * Handle conversation data from content scripts
 */
async function handleConversationUpdate(conversationText) {
  const { [KEYS.CONVERSATIONS]: existing = [] } = await chrome.storage.local.get(
    KEYS.CONVERSATIONS
  );

  // Keep last 5 conversation snippets, max 2000 chars each
  const trimmed = conversationText.slice(0, 2000);
  const updated = [trimmed, ...existing].slice(0, 5);

  await chrome.storage.local.set({ [KEYS.CONVERSATIONS]: updated });

  // Check if we need to sync (with rate limiting)
  const { [KEYS.QUOTES]: quotes = [], [KEYS.LAST_SYNC]: lastSync = 0 } =
    await chrome.storage.local.get([KEYS.QUOTES, KEYS.LAST_SYNC]);

  const timeSinceLastSync = Date.now() - lastSync;

  if (quotes.length < MIN_CACHE_SIZE && timeSinceLastSync > MIN_SYNC_INTERVAL_MS) {
    console.log("[Musing] Cache low, triggering sync");
    await syncQuotes();
  }
}

/**
 * Check if online
 */
function isOnline() {
  // In service workers, navigator.onLine may not be reliable
  // We'll rely on fetch failures instead
  return true;
}

/**
 * Sleep utility for retry backoff
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with exponential backoff retry
 */
async function fetchWithRetry(url, options, maxRetries = MAX_RETRY_ATTEMPTS) {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      // Clear any stored errors on success
      await chrome.storage.local.remove(KEYS.LAST_ERROR);
      return response;
    } catch (error) {
      lastError = error;
      console.warn(`[Musing] Fetch attempt ${attempt + 1} failed:`, error.message);

      if (attempt < maxRetries - 1) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt) * 1000;
        await sleep(delay);
      }
    }
  }

  // Store the error for debugging
  await chrome.storage.local.set({
    [KEYS.LAST_ERROR]: {
      message: lastError.message,
      timestamp: Date.now(),
    },
  });

  throw lastError;
}

/**
 * Sync quotes from server
 */
async function syncQuotes() {
  // Rate limiting check
  const { [KEYS.LAST_SYNC]: lastSync = 0 } = await chrome.storage.local.get(KEYS.LAST_SYNC);
  const timeSinceLastSync = Date.now() - lastSync;

  if (timeSinceLastSync < MIN_SYNC_INTERVAL_MS) {
    console.log("[Musing] Sync rate limited, skipping");
    return { success: true, skipped: true };
  }

  const { [KEYS.CONVERSATIONS]: conversations = [] } =
    await chrome.storage.local.get(KEYS.CONVERSATIONS);

  const combinedText = conversations.join("\n\n---\n\n");

  try {
    await fetchAndCacheQuotes(combinedText);

    await chrome.storage.local.set({
      [KEYS.LAST_SYNC]: Date.now(),
    });

    // Clear pending sync flag
    await chrome.storage.local.remove(KEYS.PENDING_SYNC);

    return { success: true };
  } catch (error) {
    console.error("[Musing] Sync failed:", error);

    // Mark as pending for retry when online
    await chrome.storage.local.set({ [KEYS.PENDING_SYNC]: true });

    // Schedule retry in 5 minutes
    chrome.alarms.create("retry-sync", { delayInMinutes: 5 });

    return { success: false, error: "Sync failed - will retry" };
  }
}

/**
 * Fetch quotes from API and cache them
 */
async function fetchAndCacheQuotes(conversationText) {
  const response = await fetchWithRetry(`${API_URL}/quotes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversation: conversationText || "general knowledge learning programming",
      count: DEFAULT_CACHE_SIZE,
    }),
  });

  const data = await response.json();
  const { quotes = [], themes = [] } = data;

  console.log("[Musing] Fetched quotes for themes:", themes);

  // Merge with existing cache, avoiding duplicates
  const { [KEYS.QUOTES]: existing = [] } = await chrome.storage.local.get(
    KEYS.QUOTES
  );

  const existingIds = new Set(existing.map((q) => q.id));
  const newQuotes = quotes.filter((q) => !existingIds.has(q.id));

  // Keep max 30 quotes in cache
  const merged = [...newQuotes, ...existing].slice(0, 30);

  await chrome.storage.local.set({ [KEYS.QUOTES]: merged });
  console.log("[Musing] Cache updated, total quotes:", merged.length);
}

/**
 * Get a quote to display, avoiding recently shown ones
 */
async function getQuoteForDisplay() {
  const {
    [KEYS.QUOTES]: quotes = [],
    [KEYS.SHOWN_QUOTE_IDS]: shownIds = [],
  } = await chrome.storage.local.get([KEYS.QUOTES, KEYS.SHOWN_QUOTE_IDS]);

  // Use cached quotes if available, otherwise fallbacks
  const availableQuotes = quotes.length > 0 ? quotes : FALLBACK_QUOTES;

  // Filter out recently shown quotes
  const recentlyShown = new Set(shownIds.slice(0, 10));
  let available = availableQuotes.filter((q) => !recentlyShown.has(q.id));

  // If all have been shown, reset
  if (available.length === 0) {
    available = availableQuotes;
    await chrome.storage.local.set({ [KEYS.SHOWN_QUOTE_IDS]: [] });
  }

  // Pick random quote
  const quote = available[Math.floor(Math.random() * available.length)];

  // Track shown quotes
  const updatedShown = [quote.id, ...shownIds].slice(0, 20);
  await chrome.storage.local.set({ [KEYS.SHOWN_QUOTE_IDS]: updatedShown });

  return quote;
}

// Export for testing
if (typeof module !== "undefined") {
  module.exports = { syncQuotes, fetchAndCacheQuotes, getQuoteForDisplay, FALLBACK_QUOTES };
}
