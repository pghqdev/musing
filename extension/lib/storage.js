/**
 * Store — single owner of the chrome.storage.local namespace.
 *
 * Every key name, default value, and read-modify-write sequence lives here.
 * Callers use the grouped intents below and never see a raw key string.
 *
 * Loaded in three contexts: importScripts (service worker), <script> tags
 * (popup/newtab), and content_scripts (isolated worlds). Each context gets
 * its own instance; the storage area itself is shared.
 */

const Store = (() => {
  const K = {
    SETTINGS: "musing_settings",
    AI_SETTINGS: "ai_settings",
    AI_REASON_CACHE: "ai_reason_cache",
    NOTIFICATION_SETTINGS: "notification_settings",
    PENDING_UPDATE: "pending_update",
    NOTIFICATIONS_DISMISSED: "notifications_dismissed",
    LAST_SEEN_VERSION: "last_seen_version",
    HISTORY_SETTINGS: "history_settings",
    QUOTES: "cached_quotes",
    DAILY_QUOTE: "daily_quote_state",
    FAVORITES: "favorite_quotes",
    BLOCKED_THEMES: "blocked_themes",
    EXTRACTED_THEMES: "extracted_themes",
    HISTORY_THEMES: "history_themes",
    SHOWN_QUOTE_IDS: "shown_quote_ids",
    SHOWN_QUOTES_HISTORY: "shown_quotes_history",
    CONVERSATIONS: "recent_conversations",
    LAST_PROCESS: "last_process_timestamp",
    API_CAPTURES: "api_captures",
    SCRAPE_LOG: "scrape_log",
    LAST_SCRAPE: "last_scrape_timestamps",
    LAST_SYNC: "last_sync_timestamp",
    ONBOARDING: "onboarding_complete",
  };

  const SETTINGS_DEFAULTS = {
    enableClaude: true,
    enableChatGPT: true,
    enableGemini: true,
    enableApiCapture: true,
    dailyQuoteEnabled: false,
    showThemeChips: true,
    proactiveScrapeEnabled: false,
  };

  const AI_DEFAULTS = {
    aiEnabled: false,
    aiProvider: "groq",
    aiModel: "llama-3.3-70b-versatile",
    aiApiKeys: { groq: "", claude: "", openai: "" },
  };

  const NOTIFICATION_DEFAULTS = {
    showUpdateNotifications: true,
    showPromotions: true,
  };

  const HISTORY_SETTINGS_DEFAULTS = {
    enableBrowserHistory: false,
    historyDaysBack: 7,
    excludedDomains: [],
  };

  const MAX_CONVERSATIONS = 5;
  const MAX_CONVERSATION_CHARS = 2000;
  const MAX_API_CAPTURES = 10;
  const MAX_SCRAPE_LOG_ENTRIES = 20;
  const MAX_FAVORITES = 200;
  const MAX_BLOCKED_THEMES = 200;
  const MAX_SHOWN_IDS = 20;
  const MAX_SHOWN_HISTORY = 80;
  const MAX_DISMISSED = 20;
  const VALID_PLATFORMS = ["claude", "chatgpt", "gemini"];

  // Single internal seam to the backend; tests stub globalThis.chrome.
  const backend = () => chrome.storage.local;

  async function read(key, fallback) {
    const data = await backend().get(key);
    const value = data[key];
    return value === undefined || value === null ? fallback : value;
  }

  async function readArray(key) {
    const value = await read(key, []);
    return Array.isArray(value) ? value : [];
  }

  function write(entries) {
    return backend().set(entries);
  }

  const settings = {
    async get() {
      const raw = await read(K.SETTINGS, {});
      return { ...SETTINGS_DEFAULTS, ...raw };
    },
    set(value) {
      return write({ [K.SETTINGS]: value });
    },
    onChanged(callback) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === "local" && changes[K.SETTINGS]) {
          callback({ ...SETTINGS_DEFAULTS, ...(changes[K.SETTINGS].newValue || {}) });
        }
      });
    },
  };

  const ai = {
    async get() {
      const raw = await read(K.AI_SETTINGS, {});
      const merged = {
        ...AI_DEFAULTS,
        ...raw,
        aiApiKeys: { ...AI_DEFAULTS.aiApiKeys, ...(raw.aiApiKeys || {}) },
      };
      // Migrate legacy single-key format into the per-provider map
      if (raw.aiApiKey && !raw.aiApiKeys) {
        merged.aiApiKeys = { ...merged.aiApiKeys, [merged.aiProvider]: raw.aiApiKey };
      }
      return merged;
    },
    set(value) {
      return write({ [K.AI_SETTINGS]: value });
    },
    getReasonCache() {
      return read(K.AI_REASON_CACHE, {});
    },
    setReasonCache(cache) {
      return write({ [K.AI_REASON_CACHE]: cache });
    },
  };

  const notifications = {
    async getSettings() {
      const raw = await read(K.NOTIFICATION_SETTINGS, {});
      return { ...NOTIFICATION_DEFAULTS, ...raw };
    },
    setSettings(value) {
      return write({ [K.NOTIFICATION_SETTINGS]: value });
    },
    async getPendingState() {
      const data = await backend().get([K.PENDING_UPDATE, K.NOTIFICATIONS_DISMISSED]);
      return {
        pendingUpdate: data[K.PENDING_UPDATE] || null,
        dismissed: data[K.NOTIFICATIONS_DISMISSED] || [],
      };
    },
    setPendingUpdate(info) {
      return write({ [K.PENDING_UPDATE]: info });
    },
    async dismiss(notificationId) {
      const dismissed = await readArray(K.NOTIFICATIONS_DISMISSED);
      if (!dismissed.includes(notificationId)) {
        dismissed.push(notificationId);
        await write({ [K.NOTIFICATIONS_DISMISSED]: dismissed.slice(-MAX_DISMISSED) });
      }
      if (notificationId.startsWith("update-")) {
        await backend().remove(K.PENDING_UPDATE);
      }
    },
    setLastSeenVersion(version) {
      return write({ [K.LAST_SEEN_VERSION]: version });
    },
  };

  const historySettings = {
    async get() {
      const raw = await read(K.HISTORY_SETTINGS, {});
      return { ...HISTORY_SETTINGS_DEFAULTS, ...raw };
    },
    set(value) {
      return write({ [K.HISTORY_SETTINGS]: value });
    },
  };

  const quotes = {
    getCache() {
      return readArray(K.QUOTES);
    },
    setCache(list) {
      return write({ [K.QUOTES]: list });
    },
    getDailyState() {
      return read(K.DAILY_QUOTE, null);
    },
    setDailyState(state) {
      return write({ [K.DAILY_QUOTE]: state });
    },
  };

  const favorites = {
    list() {
      return readArray(K.FAVORITES);
    },
    async isFavorite(id) {
      if (!id) return false;
      const list = await favorites.list();
      return list.some((q) => q?.id === id);
    },
    async toggle(quote) {
      if (!quote?.id) return { favorited: false };
      const list = await favorites.list();
      const existingIndex = list.findIndex((q) => q?.id === quote.id);
      if (existingIndex >= 0) {
        list.splice(existingIndex, 1);
        await write({ [K.FAVORITES]: list });
        return { favorited: false };
      }
      const entry = {
        id: quote.id,
        text: quote.text,
        author: quote.author,
        themes: quote.themes || [],
        savedAt: Date.now(),
      };
      await write({ [K.FAVORITES]: [entry, ...list].slice(0, MAX_FAVORITES) });
      return { favorited: true };
    },
    async remove(id) {
      if (!id) return;
      const list = await favorites.list();
      await write({ [K.FAVORITES]: list.filter((q) => q?.id !== id) });
    },
    clear() {
      return write({ [K.FAVORITES]: [] });
    },
  };

  const themes = {
    async blocked() {
      const list = await readArray(K.BLOCKED_THEMES);
      return list.map((t) => String(t).toLowerCase()).filter(Boolean);
    },
    async blockedSet() {
      return new Set(await themes.blocked());
    },
    async block(name) {
      const normalized = String(name || "").toLowerCase().trim();
      if (!normalized) return;
      const list = await themes.blocked();
      if (!list.includes(normalized)) {
        await write({ [K.BLOCKED_THEMES]: [normalized, ...list].slice(0, MAX_BLOCKED_THEMES) });
      }
    },
    async unblock(name) {
      const normalized = String(name || "").toLowerCase().trim();
      if (!normalized) return;
      const list = await themes.blocked();
      await write({ [K.BLOCKED_THEMES]: list.filter((t) => t !== normalized) });
    },
    clearBlocked() {
      return write({ [K.BLOCKED_THEMES]: [] });
    },
    getExtracted() {
      return readArray(K.EXTRACTED_THEMES);
    },
    setExtracted(list) {
      return write({ [K.EXTRACTED_THEMES]: list });
    },
    getHistoryThemes() {
      return read(K.HISTORY_THEMES, {});
    },
    setHistoryThemes(data) {
      return write({ [K.HISTORY_THEMES]: data });
    },
  };

  const history = {
    recentIds() {
      return readArray(K.SHOWN_QUOTE_IDS);
    },
    /**
     * Record that a quote was actually shown: updates both anti-repeat
     * mechanisms (recency ids + the history ledger) in one intent.
     */
    async recordShown(quote) {
      if (!quote?.id) return;
      try {
        const ids = await history.recentIds();
        const dedupedIds = [quote.id, ...ids.filter((id) => id !== quote.id)].slice(0, MAX_SHOWN_IDS);
        const ledger = await readArray(K.SHOWN_QUOTES_HISTORY);
        const entry = {
          id: quote.id,
          text: quote.text,
          author: quote.author,
          themes: quote.themes || [],
          shownAt: Date.now(),
        };
        const dedupedLedger = [entry, ...ledger.filter((h) => h?.id !== quote.id)].slice(0, MAX_SHOWN_HISTORY);
        await write({
          [K.SHOWN_QUOTE_IDS]: dedupedIds,
          [K.SHOWN_QUOTES_HISTORY]: dedupedLedger,
        });
      } catch {
        // Storage failure here must never block displaying the quote
      }
    },
    resetShownIds() {
      return write({ [K.SHOWN_QUOTE_IDS]: [] });
    },
  };

  const conversations = {
    list() {
      return readArray(K.CONVERSATIONS);
    },
    async add(text) {
      const existing = await conversations.list();
      const trimmed = text.slice(0, MAX_CONVERSATION_CHARS);
      await write({ [K.CONVERSATIONS]: [trimmed, ...existing].slice(0, MAX_CONVERSATIONS) });
    },
    lastProcessedAt() {
      return read(K.LAST_PROCESS, 0);
    },
    markProcessed() {
      return write({ [K.LAST_PROCESS]: Date.now() });
    },
    async addCapture(capture) {
      const existing = await readArray(K.API_CAPTURES);
      await write({ [K.API_CAPTURES]: [capture, ...existing].slice(0, MAX_API_CAPTURES) });
    },
  };

  const scrape = {
    log() {
      return readArray(K.SCRAPE_LOG);
    },
    async appendLog(entry) {
      const logs = await scrape.log();
      await write({ [K.SCRAPE_LOG]: [entry, ...logs].slice(0, MAX_SCRAPE_LOG_ENTRIES) });
    },
    timestamps() {
      return read(K.LAST_SCRAPE, {});
    },
    async markScraped(platform) {
      if (!VALID_PLATFORMS.includes(platform)) return;
      const timestamps = await scrape.timestamps();
      timestamps[platform] = Date.now();
      await write({ [K.LAST_SCRAPE]: timestamps });
    },
    resetTimestamps() {
      return write({ [K.LAST_SCRAPE]: { claude: 0, chatgpt: 0, gemini: 0 } });
    },
  };

  const sync = {
    lastSyncAt() {
      return read(K.LAST_SYNC, null);
    },
    markSynced() {
      return write({ [K.LAST_SYNC]: Date.now() });
    },
  };

  const onboarding = {
    async isDone() {
      return Boolean(await read(K.ONBOARDING, false));
    },
    markDone() {
      return write({ [K.ONBOARDING]: true });
    },
  };

  /** Wipe everything captured from the user's browsing (popup "clear data"). */
  function clearCapturedData() {
    return backend().remove([K.SCRAPE_LOG, K.CONVERSATIONS, K.QUOTES]);
  }

  /** Raw dump of the whole storage area (popup debug view). */
  function dumpAll() {
    return backend().get(null);
  }

  return {
    settings,
    ai,
    notifications,
    historySettings,
    quotes,
    favorites,
    themes,
    history,
    conversations,
    scrape,
    sync,
    onboarding,
    clearCapturedData,
    dumpAll,
  };
})();

// Export for use in extension
if (typeof module !== "undefined" && module.exports) {
  module.exports = { Store };
}
