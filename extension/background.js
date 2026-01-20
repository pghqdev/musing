/**
 * Background Service Worker
 * Handles quote caching, periodic sync, and communication with content scripts
 */

const API_URL = "https://llm-quotes-api.YOUR_SUBDOMAIN.workers.dev"; // Update after deployment
const SYNC_INTERVAL_HOURS = 24;
const MIN_CACHE_SIZE = 5;
const DEFAULT_CACHE_SIZE = 15;

// Storage keys
const KEYS = {
  QUOTES: "cached_quotes",
  CONVERSATIONS: "recent_conversations",
  LAST_SYNC: "last_sync_timestamp",
  SHOWN_QUOTE_IDS: "shown_quote_ids",
};

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
    syncQuotes().then(() => sendResponse({ success: true }));
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

  // Check if we need to sync
  const { [KEYS.QUOTES]: quotes = [] } = await chrome.storage.local.get(KEYS.QUOTES);
  if (quotes.length < MIN_CACHE_SIZE) {
    console.log("[Musing] Cache low, triggering sync");
    await syncQuotes();
  }
}

/**
 * Sync quotes from server
 */
async function syncQuotes() {
  const { [KEYS.CONVERSATIONS]: conversations = [] } =
    await chrome.storage.local.get(KEYS.CONVERSATIONS);

  const combinedText = conversations.join("\n\n---\n\n");
  await fetchAndCacheQuotes(combinedText);

  await chrome.storage.local.set({
    [KEYS.LAST_SYNC]: Date.now(),
  });
}

/**
 * Fetch quotes from API and cache them
 */
async function fetchAndCacheQuotes(conversationText) {
  try {
    const response = await fetch(`${API_URL}/quotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation: conversationText || "general knowledge learning programming",
        count: DEFAULT_CACHE_SIZE,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

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
  } catch (error) {
    console.error("[Musing] Failed to fetch quotes:", error);
  }
}

/**
 * Get a quote to display, avoiding recently shown ones
 */
async function getQuoteForDisplay() {
  const {
    [KEYS.QUOTES]: quotes = [],
    [KEYS.SHOWN_QUOTE_IDS]: shownIds = [],
  } = await chrome.storage.local.get([KEYS.QUOTES, KEYS.SHOWN_QUOTE_IDS]);

  if (quotes.length === 0) {
    return {
      text: "The journey of a thousand miles begins with a single step.",
      author: "Lao Tzu",
    };
  }

  // Filter out recently shown quotes
  const recentlyShown = new Set(shownIds.slice(0, 10));
  let available = quotes.filter((q) => !recentlyShown.has(q.id));

  // If all have been shown, reset
  if (available.length === 0) {
    available = quotes;
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
  module.exports = { syncQuotes, fetchAndCacheQuotes, getQuoteForDisplay };
}
