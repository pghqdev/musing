/**
 * Background Service Worker
 * Handles quote caching and communication with content scripts
 *
 * Local by default - optional BYOK intelligence for Smart Reasons
 */

// Import local modules
importScripts("lib/theme-extractor.js", "lib/quotes-db.js", "lib/ai-reason-generator.js", "lib/history-extractor.js");

const MIN_CACHE_SIZE = 5;
const DEFAULT_CACHE_SIZE = 15;
const MIN_PROCESS_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes between processing
const SETTINGS_KEY = "musing_settings";

// Storage keys
const KEYS = {
  QUOTES: "cached_quotes",
  CONVERSATIONS: "recent_conversations",
  LAST_PROCESS: "last_process_timestamp",
  LAST_SYNC: "last_sync_timestamp",
  SHOWN_QUOTE_IDS: "shown_quote_ids",
  SHOWN_QUOTES_HISTORY: "shown_quotes_history",
  EXTRACTED_THEMES: "extracted_themes",
  LAST_SCRAPE: "last_scrape_timestamps",
  API_CAPTURES: "api_captures",
  AI_SETTINGS: "ai_settings",
  BLOCKED_THEMES: "blocked_themes",
  // Notification keys
  LAST_SEEN_VERSION: "last_seen_version",
  PENDING_UPDATE_NOTIFICATION: "pending_update",
  NOTIFICATIONS_DISMISSED: "notifications_dismissed",
  NOTIFICATION_SETTINGS: "notification_settings",
  // History keys
  HISTORY_SETTINGS: "history_settings",
  HISTORY_THEMES: "history_themes",
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

async function getBlockedThemesSet() {
  const { [KEYS.BLOCKED_THEMES]: blocked = [] } = await chrome.storage.local.get(KEYS.BLOCKED_THEMES);
  const list = Array.isArray(blocked) ? blocked : [];
  return new Set(list.map((t) => String(t).toLowerCase()).filter(Boolean));
}

function filterBlockedThemes(themes, blockedSet) {
  if (!themes || themes.length === 0) return [];
  return themes.map((t) => String(t)).filter((t) => t && !blockedSet.has(t.toLowerCase()));
}

function quoteIsBlocked(quote, blockedSet) {
  const themes = quote?.themes || [];
  return Array.isArray(themes) && themes.some((t) => blockedSet.has(String(t).toLowerCase()));
}

// Note: Quotes are now sourced from lib/quotes-db.js (QUOTES_DB)
// No fallback needed - local database always available

// Initialize on install
chrome.runtime.onInstalled.addListener(async (details) => {
  const currentVersion = chrome.runtime.getManifest().version;
  console.log("[Musing] Extension event:", details.reason, "version:", currentVersion);

  if (details.reason === "install") {
    console.log("[Musing] Fresh install - fully local mode");

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

    const { [SETTINGS_KEY]: settings } = await chrome.storage.local.get(SETTINGS_KEY);
    if (!settings || typeof settings !== "object") {
      await chrome.storage.local.set({
        [SETTINGS_KEY]: {
          searchEngine: "google",
          enableClaude: true,
          enableChatGPT: true,
          enableGemini: true,
          dailyQuoteEnabled: false,
          showThemeChips: true,
          proactiveScrapeEnabled: false,
        },
      });
    } else if (typeof settings.proactiveScrapeEnabled !== "boolean") {
      await chrome.storage.local.set({
        [SETTINGS_KEY]: { ...settings, proactiveScrapeEnabled: false },
      });
    }

    // Store initial version
    await chrome.storage.local.set({ [KEYS.LAST_SEEN_VERSION]: currentVersion });

  } else if (details.reason === "update") {
    const previousVersion = details.previousVersion;
    console.log("[Musing] Extension updated from", previousVersion, "to", currentVersion);

    // Check notification settings
    const { [KEYS.NOTIFICATION_SETTINGS]: settings = { showUpdateNotifications: true } } =
      await chrome.storage.local.get(KEYS.NOTIFICATION_SETTINGS);

    if (settings.showUpdateNotifications && previousVersion !== currentVersion) {
      // Store pending update notification
      await chrome.storage.local.set({
        [KEYS.PENDING_UPDATE_NOTIFICATION]: {
          previousVersion,
          currentVersion,
          timestamp: Date.now(),
        },
      });
      console.log("[Musing] Stored pending update notification");
    }

    // Update stored version
    await chrome.storage.local.set({ [KEYS.LAST_SEEN_VERSION]: currentVersion });
  }
});

async function getProactiveScrapeEnabled() {
  const { [SETTINGS_KEY]: settings = {} } = await chrome.storage.local.get(SETTINGS_KEY);
  if (typeof settings.proactiveScrapeEnabled === "boolean") return settings.proactiveScrapeEnabled;
  return true;
}

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

  if (message.type === "GET_PENDING_NOTIFICATIONS") {
    getPendingNotifications().then(sendResponse);
    return true;
  }

  if (message.type === "DISMISS_NOTIFICATION") {
    dismissNotification(message.notificationId).then(sendResponse);
    return true;
  }

  if (message.type === "PROCESS_HISTORY") {
    processHistoryThemes().then(sendResponse);
    return true;
  }

  if (message.type === "CHECK_HISTORY_PERMISSION") {
    chrome.permissions.contains({ permissions: ["history"] }).then(sendResponse);
    return true;
  }

  if (message.type === "REQUEST_HISTORY_PERMISSION") {
    chrome.permissions.request({ permissions: ["history"] }).then(sendResponse);
    return true;
  }
});

/**
 * Get pending notifications for the new tab page
 */
async function getPendingNotifications() {
  const {
    [KEYS.PENDING_UPDATE_NOTIFICATION]: pendingUpdate,
    [KEYS.NOTIFICATIONS_DISMISSED]: dismissed = [],
    [KEYS.NOTIFICATION_SETTINGS]: settings = { showUpdateNotifications: true, showPromotions: true },
  } = await chrome.storage.local.get([
    KEYS.PENDING_UPDATE_NOTIFICATION,
    KEYS.NOTIFICATIONS_DISMISSED,
    KEYS.NOTIFICATION_SETTINGS,
  ]);

  const notifications = [];

  // Check for update notification
  if (pendingUpdate && settings.showUpdateNotifications) {
    const notificationId = `update-${pendingUpdate.currentVersion}`;
    if (!dismissed.includes(notificationId)) {
      notifications.push({
        id: notificationId,
        type: "update",
        title: `Updated to v${pendingUpdate.currentVersion}`,
        previousVersion: pendingUpdate.previousVersion,
        currentVersion: pendingUpdate.currentVersion,
        timestamp: pendingUpdate.timestamp,
      });
    }
  }

  return { notifications };
}

/**
 * Dismiss a notification
 */
async function dismissNotification(notificationId) {
  const { [KEYS.NOTIFICATIONS_DISMISSED]: dismissed = [] } =
    await chrome.storage.local.get(KEYS.NOTIFICATIONS_DISMISSED);

  if (!dismissed.includes(notificationId)) {
    dismissed.push(notificationId);
    // Keep only last 20 dismissed notifications
    const trimmed = dismissed.slice(-20);
    await chrome.storage.local.set({ [KEYS.NOTIFICATIONS_DISMISSED]: trimmed });
  }

  // If this was an update notification, also clear the pending update
  if (notificationId.startsWith("update-")) {
    await chrome.storage.local.remove(KEYS.PENDING_UPDATE_NOTIFICATION);
  }

  console.log("[Musing] Notification dismissed:", notificationId);
  return { success: true };
}

/**
 * Process browser history to extract themes
 * Uses the history-extractor module
 */
async function processHistoryThemes() {
  try {
    // Get history settings
    const { [KEYS.HISTORY_SETTINGS]: settings = {} } =
      await chrome.storage.local.get(KEYS.HISTORY_SETTINGS);

    if (!settings.enableBrowserHistory && !settings.enableGoogleSearchHistory) {
      console.log("[Musing] History processing skipped - not enabled");
      return { success: true, skipped: true };
    }

    // Extract themes from history using the history-extractor module
    const result = await extractHistoryThemes(settings);

    if (result.themes && result.themes.length > 0) {
      // Store extracted history themes
      await chrome.storage.local.set({
        [KEYS.HISTORY_THEMES]: {
          themes: result.themes,
          extractedAt: Date.now(),
          sourceCount: result.sourceCount,
          searchQueryCount: result.searchQueryCount || 0,
          titleCount: result.titleCount || 0,
        },
      });

      console.log("[Musing] History themes extracted:", result.themes.length, "themes from", result.sourceCount, "sources");

      // Refresh quote cache with combined themes
      await refreshQuoteCacheWithHistoryThemes();
    }

    return { success: true, themes: result.themes, sourceCount: result.sourceCount };
  } catch (error) {
    console.error("[Musing] History processing failed:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Refresh quote cache combining conversation themes and history themes
 */
async function refreshQuoteCacheWithHistoryThemes() {
  const {
    [KEYS.EXTRACTED_THEMES]: conversationThemes = [],
    [KEYS.HISTORY_THEMES]: historyData = {},
  } = await chrome.storage.local.get([KEYS.EXTRACTED_THEMES, KEYS.HISTORY_THEMES]);

  const historyThemes = historyData.themes || [];

  // Combine themes, prioritizing conversation themes
  const combinedThemes = [...new Set([...conversationThemes, ...historyThemes])];

  // Refresh quote cache with combined themes
  await refreshLocalQuoteCache(combinedThemes);
}

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
  if (!(await getProactiveScrapeEnabled())) {
    return;
  }

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
  const blockedSet = await getBlockedThemesSet();
  const filteredThemes = filterBlockedThemes(themes, blockedSet);

  console.log("[Musing] Extracted themes locally:", filteredThemes);

  // Store extracted themes
  await chrome.storage.local.set({
    [KEYS.EXTRACTED_THEMES]: filteredThemes,
    [KEYS.LAST_PROCESS]: Date.now(),
  });

  // Refresh quote cache based on new themes
  await refreshLocalQuoteCache(filteredThemes);
}

/**
 * Refresh the local quote cache based on themes
 * Uses the bundled quotes database - no network requests
 */
async function refreshLocalQuoteCache(themes = []) {
  const blockedSet = await getBlockedThemesSet();
  const filteredThemes = filterBlockedThemes(themes, blockedSet);

  // Get quotes matching themes from local database (async)
  const matchingQuotes = await findQuotesByThemes(filteredThemes, DEFAULT_CACHE_SIZE);
  const unblockedMatching = matchingQuotes.filter((q) => !quoteIsBlocked(q, blockedSet));

  // Get existing cache
  const { [KEYS.QUOTES]: existing = [] } = await chrome.storage.local.get(KEYS.QUOTES);

  // Merge new quotes with existing, avoiding duplicates
  const existingIds = new Set(existing.map((q) => q.id));
  const newQuotes = unblockedMatching.filter((q) => !existingIds.has(q.id));

  // Keep max 30 quotes in cache, prioritizing new themed quotes
  const merged = [...newQuotes, ...existing].slice(0, 30);

  await chrome.storage.local.set({ [KEYS.QUOTES]: merged });
  console.log("[Musing] Local cache updated, total quotes:", merged.length, "themes:", filteredThemes);
}

/**
 * Get a quote to display, avoiding recently shown ones
 * Uses local quote database - no network requests for base functionality
 * Optionally uses AI API for personalized reasons if enabled
 */
async function getQuoteForDisplay() {
  const {
    [KEYS.QUOTES]: quotes = [],
    [KEYS.SHOWN_QUOTE_IDS]: shownIds = [],
    [KEYS.EXTRACTED_THEMES]: themes = [],
    [KEYS.CONVERSATIONS]: conversations = [],
    [KEYS.AI_SETTINGS]: aiSettings = {},
    [KEYS.HISTORY_THEMES]: historyData = {},
    [KEYS.BLOCKED_THEMES]: blockedThemes = [],
  } = await chrome.storage.local.get([
    KEYS.QUOTES,
    KEYS.SHOWN_QUOTE_IDS,
    KEYS.EXTRACTED_THEMES,
    KEYS.CONVERSATIONS,
    KEYS.AI_SETTINGS,
    KEYS.HISTORY_THEMES,
    KEYS.BLOCKED_THEMES,
  ]);

  const blockedSet = new Set((Array.isArray(blockedThemes) ? blockedThemes : []).map((t) => String(t).toLowerCase()).filter(Boolean));

  // Combine conversation themes with history themes
  const historyThemes = historyData.themes || [];
  const combinedThemes = filterBlockedThemes([...new Set([...themes, ...historyThemes])], blockedSet);

  // Ensure quotes are loaded from JSON
  await ensureQuotesLoaded();

  // Use cached quotes if available, otherwise get from local database
  let availableQuotes = quotes.length > 0 ? quotes : QUOTES_DB;

  // If cache is low, refresh from local database with combined themes
  if (quotes.length < MIN_CACHE_SIZE) {
    availableQuotes = await findQuotesByThemes(combinedThemes, DEFAULT_CACHE_SIZE);
  }

  // Filter out recently shown quotes
  const recentlyShown = new Set(shownIds.slice(0, 10));
  let available = availableQuotes.filter((q) => !recentlyShown.has(q.id)).filter((q) => !quoteIsBlocked(q, blockedSet));

  // If all have been shown, reset and get fresh quotes
  if (available.length === 0) {
    available = (await findQuotesByThemes(combinedThemes, DEFAULT_CACHE_SIZE)).filter((q) => !quoteIsBlocked(q, blockedSet));
    await chrome.storage.local.set({ [KEYS.SHOWN_QUOTE_IDS]: [] });
  }

  // Pick random quote
  const quote = available[Math.floor(Math.random() * available.length)];

  // Track shown quotes
  const updatedShown = [quote.id, ...shownIds].slice(0, 20);
  await chrome.storage.local.set({ [KEYS.SHOWN_QUOTE_IDS]: updatedShown });

  try {
    const { [KEYS.SHOWN_QUOTES_HISTORY]: history = [] } = await chrome.storage.local.get(KEYS.SHOWN_QUOTES_HISTORY);
    const normalized = Array.isArray(history) ? history : [];
    const entry = {
      id: quote.id,
      text: quote.text,
      author: quote.author,
      themes: quote.themes || [],
      shownAt: Date.now(),
    };
    const deduped = [entry, ...normalized.filter((h) => h?.id !== quote.id)].slice(0, 80);
    await chrome.storage.local.set({ [KEYS.SHOWN_QUOTES_HISTORY]: deduped });
  } catch {
    // ignore
  }

  // Find matched themes between user's combined themes and quote's themes
  const userThemes = new Set(combinedThemes.map((t) => t.toLowerCase()));
  const matchedThemes = (quote.themes || []).filter((t) => userThemes.has(t.toLowerCase()));

  // Try to generate AI reason if enabled
  let aiReason = null;
  const apiKey = aiSettings.aiApiKeys?.[aiSettings.aiProvider] || aiSettings.aiApiKey;
  if (aiSettings.aiEnabled && apiKey && conversations.length > 0) {
    try {
      aiReason = await generateAIReason(quote, conversations, aiSettings);
      console.log("[Musing] AI reason generated:", aiReason ? "success" : "fallback to themes");
    } catch (error) {
      console.warn("[Musing] AI reason generation error:", error.message);
    }
  }

  return {
    ...quote,
    matchedThemes: matchedThemes.length > 0 ? matchedThemes : null,
    aiReason: aiReason,
  };
}
