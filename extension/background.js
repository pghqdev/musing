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
  LAST_SCRAPE: "last_scrape_timestamps", // Per-platform scrape timestamps
  API_CAPTURES: "api_captures", // Captured API responses
};

// Proactive scraping configuration
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
const PROACTIVE_SCRAPE_TIMEOUT_MS = 30000; // 30 seconds max per tab
const PLATFORMS = {
  claude: "https://claude.ai/",
  chatgpt: "https://chatgpt.com/",
  gemini: "https://gemini.google.com/app",
};

// Track background scrape tabs
const backgroundScrapeTabs = new Map();

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

  // Set up proactive scraping check alarm (every 6 hours)
  chrome.alarms.create("check-stale-scrapes", {
    periodInMinutes: 6 * 60,
  });

  // Initialize scrape timestamps
  await chrome.storage.local.set({
    [KEYS.LAST_SCRAPE]: {
      claude: 0,
      chatgpt: 0,
      gemini: 0,
    },
  });

  // Fetch initial generic quotes
  await fetchAndCacheQuotes("");
});

// Check for stale scrapes on startup
chrome.runtime.onStartup.addListener(async () => {
  console.log("[Musing] Extension startup - checking for stale scrapes");
  await checkAndTriggerProactiveScrapes();
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
  if (alarm.name === "check-stale-scrapes") {
    console.log("[Musing] Checking for stale scrapes");
    await checkAndTriggerProactiveScrapes();
  }
  // Handle proactive scrape timeout
  if (alarm.name.startsWith("scrape-timeout-")) {
    const tabId = parseInt(alarm.name.replace("scrape-timeout-", ""), 10);
    if (backgroundScrapeTabs.has(tabId)) {
      console.log("[Musing] Scrape timeout for tab", tabId);
      await closeBackgroundScrapeTab(tabId);
    }
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
    handleConversationUpdate(message.data, sender);
    sendResponse({ success: true });
  }

  if (message.type === "API_CAPTURE") {
    handleApiCapture(message.data, sender);
    sendResponse({ success: true });
  }

  if (message.type === "SCRAPE_COMPLETE") {
    handleScrapeComplete(message.data, sender);
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
async function handleConversationUpdate(conversationText, sender) {
  const { [KEYS.CONVERSATIONS]: existing = [] } = await chrome.storage.local.get(
    KEYS.CONVERSATIONS
  );

  // Keep last 5 conversation snippets, max 2000 chars each
  const trimmed = conversationText.slice(0, 2000);
  const updated = [trimmed, ...existing].slice(0, 5);

  await chrome.storage.local.set({ [KEYS.CONVERSATIONS]: updated });

  // Update scrape timestamp for this platform
  const platform = detectPlatformFromUrl(sender?.tab?.url || "");
  if (platform) {
    await updateScrapeTimestamp(platform);
  }

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
 * Handle API capture from injector
 */
async function handleApiCapture(data, sender) {
  const { platform, text, source } = data;

  console.log("[Musing] API capture received:", platform, "length:", text?.length);

  if (!text || text.length < 20) return;

  // Store API captures separately (more structured data)
  const { [KEYS.API_CAPTURES]: existing = [] } = await chrome.storage.local.get(KEYS.API_CAPTURES);

  const capture = {
    platform,
    text: text.slice(0, 2000),
    source,
    timestamp: Date.now(),
    url: sender?.tab?.url,
  };

  const updated = [capture, ...existing].slice(0, 10);
  await chrome.storage.local.set({ [KEYS.API_CAPTURES]: updated });

  // Also add to conversations for quote generation
  await handleConversationUpdate(text, sender);
}

/**
 * Handle scrape complete signal from content scripts
 */
async function handleScrapeComplete(data, sender) {
  const { platform, sidebar } = data;
  const tabId = sender?.tab?.id;

  console.log("[Musing] Scrape complete:", platform, "sidebar items:", sidebar?.length);

  // Update scrape timestamp
  if (platform) {
    await updateScrapeTimestamp(platform);
  }

  // Store sidebar data if provided
  if (sidebar && sidebar.length > 0) {
    const sidebarText = sidebar.slice(0, 20).join("\n");
    await handleConversationUpdate(sidebarText, sender);
  }

  // If this was a background scrape tab, close it
  if (tabId && backgroundScrapeTabs.has(tabId)) {
    await closeBackgroundScrapeTab(tabId);
  }
}

/**
 * Detect platform from URL
 */
function detectPlatformFromUrl(url) {
  if (!url) return null;
  if (url.includes("claude.ai")) return "claude";
  if (url.includes("chatgpt.com")) return "chatgpt";
  if (url.includes("gemini.google.com")) return "gemini";
  return null;
}

/**
 * Update scrape timestamp for a platform
 */
async function updateScrapeTimestamp(platform) {
  const { [KEYS.LAST_SCRAPE]: timestamps = {} } = await chrome.storage.local.get(KEYS.LAST_SCRAPE);
  timestamps[platform] = Date.now();
  await chrome.storage.local.set({ [KEYS.LAST_SCRAPE]: timestamps });
}

/**
 * Check for stale scrapes and trigger proactive scraping
 */
async function checkAndTriggerProactiveScrapes() {
  const { [KEYS.LAST_SCRAPE]: timestamps = {} } = await chrome.storage.local.get(KEYS.LAST_SCRAPE);
  const now = Date.now();

  for (const [platform, url] of Object.entries(PLATFORMS)) {
    const lastScrape = timestamps[platform] || 0;
    const timeSinceLastScrape = now - lastScrape;

    if (timeSinceLastScrape > STALE_THRESHOLD_MS) {
      console.log(`[Musing] ${platform} scrape is stale, triggering proactive scrape`);
      await createBackgroundScrapeTab(platform, url);
      // Only scrape one platform at a time to avoid overwhelming
      break;
    }
  }
}

/**
 * Create a background tab for proactive scraping
 */
async function createBackgroundScrapeTab(platform, url) {
  // Check if we already have a background tab for this platform
  for (const [tabId, info] of backgroundScrapeTabs) {
    if (info.platform === platform) {
      console.log(`[Musing] Background tab already exists for ${platform}`);
      return;
    }
  }

  try {
    const tab = await chrome.tabs.create({
      url,
      active: false, // Open in background
    });

    backgroundScrapeTabs.set(tab.id, {
      platform,
      createdAt: Date.now(),
    });

    // Set timeout to close tab if scrape doesn't complete
    chrome.alarms.create(`scrape-timeout-${tab.id}`, {
      delayInMinutes: PROACTIVE_SCRAPE_TIMEOUT_MS / 60000,
    });

    console.log(`[Musing] Created background scrape tab for ${platform}:`, tab.id);
  } catch (error) {
    console.error(`[Musing] Failed to create background tab for ${platform}:`, error);
  }
}

/**
 * Close a background scrape tab
 */
async function closeBackgroundScrapeTab(tabId) {
  if (!backgroundScrapeTabs.has(tabId)) return;

  const info = backgroundScrapeTabs.get(tabId);
  backgroundScrapeTabs.delete(tabId);

  // Clear the timeout alarm
  chrome.alarms.clear(`scrape-timeout-${tabId}`);

  try {
    await chrome.tabs.remove(tabId);
    console.log(`[Musing] Closed background scrape tab for ${info.platform}:`, tabId);
  } catch (error) {
    // Tab might already be closed
    console.debug(`[Musing] Tab ${tabId} already closed or error:`, error.message);
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
