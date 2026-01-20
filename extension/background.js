/**
 * Background Service Worker
 * Handles quote caching and communication with content scripts
 *
 * FULLY LOCAL - No data sent to external servers
 * Theme extraction and quote matching happens entirely on-device
 */

// Import local modules
importScripts("lib/theme-extractor.js", "lib/quotes-db.js");

const MIN_CACHE_SIZE = 5;
const DEFAULT_CACHE_SIZE = 15;
const MIN_PROCESS_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes between processing

// Storage keys
const KEYS = {
  QUOTES: "cached_quotes",
  CONVERSATIONS: "recent_conversations",
  LAST_PROCESS: "last_process_timestamp",
  LAST_SYNC: "last_sync_timestamp",
  SHOWN_QUOTE_IDS: "shown_quote_ids",
  EXTRACTED_THEMES: "extracted_themes",
  LAST_SCRAPE: "last_scrape_timestamps",
  API_CAPTURES: "api_captures",
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

// Note: Quotes are now sourced from lib/quotes-db.js (QUOTES_DB)
// No fallback needed - local database always available

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[Musing] Extension installed - fully local mode");

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

  // Initialize with quotes from local database
  await refreshLocalQuoteCache();
});

// Check for stale scrapes on startup
chrome.runtime.onStartup.addListener(async () => {
  console.log("[Musing] Extension startup - checking for stale scrapes");
  await checkAndTriggerProactiveScrapes();
});

// Handle alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
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

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Validate sender is from this extension
  if (sender.id !== chrome.runtime.id) {
    console.warn("[Musing] Message from unknown sender:", sender.id);
    sendResponse({ error: "Unauthorized" });
    return false;
  }

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

  if (message.type === "GET_THEMES") {
    // Return currently extracted themes for debugging/display
    chrome.storage.local.get(KEYS.EXTRACTED_THEMES).then((data) => {
      sendResponse({ themes: data[KEYS.EXTRACTED_THEMES] || [] });
    });
    return true;
  }

  if (message.type === "FORCE_SYNC") {
    handleForceSync().then(sendResponse);
    return true;
  }
});

/**
 * Handle manual sync from popup
 * Refreshes local quote cache and updates sync timestamp
 */
async function handleForceSync() {
  try {
    await processConversationsLocally();
    await chrome.storage.local.set({ [KEYS.LAST_SYNC]: Date.now() });
    console.log("[Musing] Manual sync completed");
    return { success: true };
  } catch (error) {
    console.error("[Musing] Sync failed:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle conversation data from content scripts
 * All processing is done locally - no data sent to external servers
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

  // Process locally with rate limiting
  const { [KEYS.LAST_PROCESS]: lastProcess = 0 } =
    await chrome.storage.local.get(KEYS.LAST_PROCESS);

  const timeSinceLastProcess = Date.now() - lastProcess;

  if (timeSinceLastProcess > MIN_PROCESS_INTERVAL_MS) {
    console.log("[Musing] Processing conversation locally");
    await processConversationsLocally();
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
const VALID_PLATFORMS = ["claude", "chatgpt", "gemini"];

async function updateScrapeTimestamp(platform) {
  // Validate platform to prevent prototype pollution
  if (!VALID_PLATFORMS.includes(platform)) {
    console.warn("[Musing] Invalid platform:", platform);
    return;
  }
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
 * Process conversations locally to extract themes and update quote cache
 * FULLY LOCAL - No network requests
 */
async function processConversationsLocally() {
  const { [KEYS.CONVERSATIONS]: conversations = [] } =
    await chrome.storage.local.get(KEYS.CONVERSATIONS);

  const combinedText = conversations.join("\n\n");

  // Extract themes using local keyword matching
  const themes = extractThemes(combinedText, 5);

  console.log("[Musing] Extracted themes locally:", themes);

  // Store extracted themes
  await chrome.storage.local.set({
    [KEYS.EXTRACTED_THEMES]: themes,
    [KEYS.LAST_PROCESS]: Date.now(),
  });

  // Refresh quote cache based on new themes
  await refreshLocalQuoteCache(themes);
}

/**
 * Refresh the local quote cache based on themes
 * Uses the bundled quotes database - no network requests
 */
async function refreshLocalQuoteCache(themes = []) {
  // Get quotes matching themes from local database (async)
  const matchingQuotes = await findQuotesByThemes(themes, DEFAULT_CACHE_SIZE);

  // Get existing cache
  const { [KEYS.QUOTES]: existing = [] } = await chrome.storage.local.get(KEYS.QUOTES);

  // Merge new quotes with existing, avoiding duplicates
  const existingIds = new Set(existing.map((q) => q.id));
  const newQuotes = matchingQuotes.filter((q) => !existingIds.has(q.id));

  // Keep max 30 quotes in cache, prioritizing new themed quotes
  const merged = [...newQuotes, ...existing].slice(0, 30);

  await chrome.storage.local.set({ [KEYS.QUOTES]: merged });
  console.log("[Musing] Local cache updated, total quotes:", merged.length, "themes:", themes);
}

/**
 * Get a quote to display, avoiding recently shown ones
 * Uses local quote database - no network requests
 */
async function getQuoteForDisplay() {
  const {
    [KEYS.QUOTES]: quotes = [],
    [KEYS.SHOWN_QUOTE_IDS]: shownIds = [],
    [KEYS.EXTRACTED_THEMES]: themes = [],
  } = await chrome.storage.local.get([KEYS.QUOTES, KEYS.SHOWN_QUOTE_IDS, KEYS.EXTRACTED_THEMES]);

  // Ensure quotes are loaded from JSON
  await ensureQuotesLoaded();

  // Use cached quotes if available, otherwise get from local database
  let availableQuotes = quotes.length > 0 ? quotes : QUOTES_DB;

  // If cache is low, refresh from local database with current themes
  if (quotes.length < MIN_CACHE_SIZE) {
    availableQuotes = await findQuotesByThemes(themes, DEFAULT_CACHE_SIZE);
  }

  // Filter out recently shown quotes
  const recentlyShown = new Set(shownIds.slice(0, 10));
  let available = availableQuotes.filter((q) => !recentlyShown.has(q.id));

  // If all have been shown, reset and get fresh quotes
  if (available.length === 0) {
    available = await findQuotesByThemes(themes, DEFAULT_CACHE_SIZE);
    await chrome.storage.local.set({ [KEYS.SHOWN_QUOTE_IDS]: [] });
  }

  // Pick random quote
  const quote = available[Math.floor(Math.random() * available.length)];

  // Track shown quotes
  const updatedShown = [quote.id, ...shownIds].slice(0, 20);
  await chrome.storage.local.set({ [KEYS.SHOWN_QUOTE_IDS]: updatedShown });

  return quote;
}
