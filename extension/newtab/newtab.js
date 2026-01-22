/**
 * New Tab Page Script
 * Displays cached quotes instantly
 */

(function () {
  "use strict";

  const SETTINGS_KEY = "musing_settings";
  const ONBOARDING_KEY = "onboarding_complete";
  const QUOTES_KEY = "cached_quotes";
  const FAVORITES_KEY = "favorite_quotes";
  const SHOWN_QUOTES_HISTORY_KEY = "shown_quotes_history";
  const BLOCKED_THEMES_KEY = "blocked_themes";
  const DAILY_QUOTE_KEY = "daily_quote_state";
  const SEARCH_URLS = {
    google: "https://www.google.com/search?q=",
    duckduckgo: "https://duckduckgo.com/?q=",
    perplexity: "https://www.perplexity.ai/search?q=",
    chatgpt: "https://chatgpt.com/?q=",
    claude: "https://claude.ai/new?q=",
    gemini: "https://gemini.google.com/app?q=",
    wolfram: "https://www.wolframalpha.com/input?i=",
    github: "https://github.com/search?q=",
    namecheap: "https://www.namecheap.com/domains/registration/results/?domain=",
  };

  const ENGINE_NAMES = {
    google: "Google",
    duckduckgo: "DuckDuckGo",
    perplexity: "Perplexity",
    chatgpt: "ChatGPT",
    claude: "Claude",
    gemini: "Gemini",
    wolfram: "Wolfram Alpha",
    github: "GitHub",
    namecheap: "Namecheap",
  };

  const ENGINE_ICONS = {
    google: "../icons/engines/google.png",
    duckduckgo: "../icons/engines/duckduckgo.png",
    perplexity: "../icons/engines/perplexity.png",
    chatgpt: "../icons/engines/chatgpt.png",
    claude: "../icons/engines/claude.png",
    gemini: "../icons/engines/gemini.png",
    wolfram: "../icons/engines/wolfram.png",
    github: "../icons/engines/github.png",
    namecheap: "../icons/engines/namecheap.png",
  };

  // Contextual reasons for each theme - explains why a quote was recommended
  const THEME_REASONS = {
    programming: "you've been writing code",
    debugging: "you've been troubleshooting code",
    architecture: "you've been designing systems",
    algorithms: "you've been working on algorithms",
    learning: "you're exploring new concepts",
    growth: "you're focused on self-improvement",
    frustration: "you've been working through a challenge",
    curiosity: "you're exploring something new",
    excitement: "you've had a breakthrough",
    anxiety: "you're navigating uncertainty",
    career: "you're thinking about your career",
    relationships: "you're thinking about relationships",
    health: "you're focused on wellbeing",
    finance: "you're thinking about finances",
    persistence: "you're pushing through difficulty",
    patience: "you're playing the long game",
    simplicity: "you're simplifying things",
    complexity: "you're tackling something complex",
    wisdom: "you're seeking deeper understanding",
    productivity: "you're optimizing your workflow",
    motivation: "you're looking for inspiration",
    writing: "you've been writing",
    creativity: "you're brainstorming ideas",
    "decision-making": "you're weighing options",
    uncertainty: "you're navigating the unknown",
    "problem-solving": "you're solving problems",
    success: "you're chasing goals",
    failure: "you're learning from setbacks",
    time: "you're managing your time",
    communication: "you're working on communication",
    change: "you're navigating change",
    philosophy: "you're reflecting on life",
    courage: "you're facing something difficult",
    fear: "you're confronting fears",
  };

  const SEARCH_ENGINES = ["google", "duckduckgo", "perplexity"];
  const AI_PLATFORMS = ["chatgpt", "claude", "gemini"];
  const TOOLS = ["wolfram", "github", "namecheap"];

  // Version changelog - keyed by version number
  // Add entries when releasing new versions
  const VERSION_CHANGELOG = {
    "1.1.0": {
      icon: "✨",
      title: "What's New in v1.1.0",
      items: [
        { icon: "⭐", text: "Save favorite quotes and export them anytime" },
        { icon: "�️", text: "Daily quote mode for a calmer new tab" },
        { icon: "🏷️", text: "Theme chips with “less like this” controls" },
        { icon: "�", text: "Quote history plus one-click copy" },
        { icon: "🔕", text: "New proactive refresh toggle to avoid surprise tabs" },
      ],
    },
    // Add more versions as needed
  };

  // Local fallback quotes (used when service worker is unavailable)
  const LOCAL_FALLBACKS = [
    { text: "The journey of a thousand miles begins with a single step.", author: "Lao Tzu" },
    { text: "To begin, begin.", author: "William Wordsworth" },
    { text: "The only true wisdom is in knowing you know nothing.", author: "Socrates" },
    { text: "In the middle of difficulty lies opportunity.", author: "Albert Einstein" },
    { text: "The mind is everything. What you think you become.", author: "Buddha" },
  ];

  const quoteEl = document.getElementById("quote");
  const authorEl = document.getElementById("author");
  const reasonEl = document.getElementById("recommendation-reason");
  const containerEl = document.getElementById("container");
  const searchEl = document.getElementById("search");
  const refreshEl = document.getElementById("refresh");
  const loadingEl = document.getElementById("loading-indicator");
  const engineSelectorEl = document.getElementById("engine-selector");
  const engineIconEl = document.getElementById("engine-icon");
  const engineDropdownEl = document.getElementById("engine-dropdown");
  const toastEl = document.getElementById("toast");
  const copyQuoteEl = document.getElementById("copy-quote");
  const favoriteQuoteEl = document.getElementById("favorite-quote");
  const favoriteQuoteLabelEl = document.getElementById("favorite-quote-label");
  const openHistoryEl = document.getElementById("open-history");
  const historyEl = document.getElementById("history");
  const historyListEl = document.getElementById("history-list");
  const historyCloseEl = document.getElementById("history-close");
  const themeChipsEl = document.getElementById("theme-chips");

  // Notification elements
  const notificationBannerEl = document.getElementById("notification-banner");
  const notificationIconEl = document.getElementById("notification-icon");
  const notificationTitleEl = document.getElementById("notification-title");
  const notificationSubtitleEl = document.getElementById("notification-subtitle");
  const notificationViewBtnEl = document.getElementById("notification-view");
  const notificationDismissBtnEl = document.getElementById("notification-dismiss");

  // What's New modal elements
  const whatsNewEl = document.getElementById("whats-new");
  const whatsNewIconEl = document.getElementById("whats-new-icon");
  const whatsNewTitleEl = document.getElementById("whats-new-title");
  const whatsNewVersionEl = document.getElementById("whats-new-version");
  const whatsNewListEl = document.getElementById("whats-new-list");
  const whatsNewCloseBtnEl = document.getElementById("whats-new-close");

  let searchEngine = "google";
  let isInitialized = false;
  let dropdownOpen = false;
  let currentNotification = null;
  let currentQuote = null;
  let toastTimeout = null;
  let dailyQuoteEnabled = false;
  let showThemeChips = true;

  /**
   * Show loading state
   */
  function showLoading() {
    containerEl.classList.add("loading");
    if (loadingEl) {
      loadingEl.classList.add("show");
    }
  }

  /**
   * Hide loading state
   */
  function hideLoading() {
    containerEl.classList.remove("loading");
    if (loadingEl) {
      loadingEl.classList.remove("show");
    }
  }

  /**
   * Display a quote
   */
  function displayQuote(quote) {
    if (!quote || !quote.text) {
      quote = getRandomFallback();
    }

    currentQuote = quote;
    quoteEl.textContent = quote.text;
    authorEl.textContent = quote.author;

    // Display recommendation reason - prioritize AI reason over theme-based
    if (quote.aiReason) {
      // Use AI-generated contextual reason
      reasonEl.textContent = quote.aiReason;
      reasonEl.classList.add("show");
    } else if (quote.matchedThemes && quote.matchedThemes.length > 0) {
      // Fall back to theme-based reason
      const primaryTheme = quote.matchedThemes[0];
      const reason = THEME_REASONS[primaryTheme] || `you're exploring ${primaryTheme}`;
      reasonEl.textContent = reason;
      reasonEl.classList.add("show");
    } else {
      reasonEl.textContent = "";
      reasonEl.classList.remove("show");
    }

    hideLoading();
    renderThemeChips(quote);
    updateFavoriteButtonState();
    addToShownQuoteHistory(quote);
  }

  function showToast(message) {
    if (!toastEl) return;
    if (toastTimeout) {
      clearTimeout(toastTimeout);
      toastTimeout = null;
    }
    toastEl.textContent = message;
    toastEl.classList.add("show");
    toastTimeout = setTimeout(() => {
      toastEl.classList.remove("show");
    }, 1600);
  }

  async function copyCurrentQuote() {
    if (!currentQuote || !currentQuote.text) return;
    const text = `"${currentQuote.text}" — ${currentQuote.author || ""}`.trim();
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied");
    } catch {
      try {
        const el = document.createElement("textarea");
        el.value = text;
        el.setAttribute("readonly", "true");
        el.style.position = "fixed";
        el.style.left = "-9999px";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        el.remove();
        showToast("Copied");
      } catch {
        showToast("Copy failed");
      }
    }
  }

  async function loadFavorites() {
    const { [FAVORITES_KEY]: favorites = [] } = await chrome.storage.local.get(FAVORITES_KEY);
    return Array.isArray(favorites) ? favorites : [];
  }

  async function updateFavoriteButtonState() {
    if (!favoriteQuoteEl || !currentQuote?.id) return;
    const favorites = await loadFavorites();
    const isFavorited = favorites.some((q) => q.id === currentQuote.id);
    favoriteQuoteEl.classList.toggle("selected", isFavorited);
    favoriteQuoteEl.setAttribute("aria-pressed", isFavorited ? "true" : "false");
    if (favoriteQuoteLabelEl) {
      favoriteQuoteLabelEl.textContent = isFavorited ? "Saved" : "Save";
    }
  }

  async function toggleFavorite() {
    if (!currentQuote || !currentQuote.id) return;
    const favorites = await loadFavorites();
    const existingIndex = favorites.findIndex((q) => q.id === currentQuote.id);
    if (existingIndex >= 0) {
      favorites.splice(existingIndex, 1);
      await chrome.storage.local.set({ [FAVORITES_KEY]: favorites });
      showToast("Removed");
    } else {
      const entry = {
        id: currentQuote.id,
        text: currentQuote.text,
        author: currentQuote.author,
        themes: currentQuote.themes || [],
        savedAt: Date.now(),
      };
      const updated = [entry, ...favorites].slice(0, 200);
      await chrome.storage.local.set({ [FAVORITES_KEY]: updated });
      showToast("Saved");
    }
    updateFavoriteButtonState();
  }

  async function addToShownQuoteHistory(quote) {
    if (!quote?.id) return;
    try {
      const { [SHOWN_QUOTES_HISTORY_KEY]: history = [] } = await chrome.storage.local.get(SHOWN_QUOTES_HISTORY_KEY);
      const normalized = Array.isArray(history) ? history : [];
      const entry = {
        id: quote.id,
        text: quote.text,
        author: quote.author,
        themes: quote.themes || [],
        shownAt: Date.now(),
      };
      const deduped = [entry, ...normalized.filter((h) => h?.id !== quote.id)].slice(0, 80);
      await chrome.storage.local.set({ [SHOWN_QUOTES_HISTORY_KEY]: deduped });
    } catch {
      // ignore
    }
  }

  function formatTimeAgo(timestamp) {
    const diffMs = Date.now() - timestamp;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  async function openHistory() {
    if (!historyEl || !historyListEl) return;
    const { [SHOWN_QUOTES_HISTORY_KEY]: history = [] } = await chrome.storage.local.get(SHOWN_QUOTES_HISTORY_KEY);
    const items = (Array.isArray(history) ? history : []).slice(0, 60);
    historyListEl.replaceChildren();

    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.style.padding = "1rem";
      empty.style.textAlign = "center";
      empty.style.color = "inherit";
      empty.style.opacity = "0.7";
      empty.textContent = "No history yet";
      historyListEl.appendChild(empty);
    } else {
      items.forEach((item) => {
        const row = document.createElement("div");
        row.className = "history-item";
        row.tabIndex = 0;

        const text = document.createElement("div");
        text.className = "history-item-text";
        text.textContent = item.text || "";
        row.appendChild(text);

        const meta = document.createElement("div");
        meta.className = "history-item-meta";
        const author = document.createElement("span");
        author.textContent = item.author || "";
        const time = document.createElement("span");
        time.textContent = item.shownAt ? formatTimeAgo(item.shownAt) : "";
        meta.appendChild(author);
        meta.appendChild(time);
        row.appendChild(meta);

        const open = () => {
          displayQuote(item);
          closeHistory();
        };
        row.addEventListener("click", open);
        row.addEventListener("keydown", (e) => {
          if (e.key === "Enter") open();
        });

        historyListEl.appendChild(row);
      });
    }

    historyEl.classList.add("show");
  }

  function closeHistory() {
    if (historyEl) historyEl.classList.remove("show");
  }

  async function loadBlockedThemes() {
    const { [BLOCKED_THEMES_KEY]: blocked = [] } = await chrome.storage.local.get(BLOCKED_THEMES_KEY);
    const list = Array.isArray(blocked) ? blocked : [];
    return list.map((t) => String(t).toLowerCase()).filter(Boolean);
  }

  async function blockTheme(theme) {
    const normalized = String(theme || "").toLowerCase().trim();
    if (!normalized) return;
    const blocked = await loadBlockedThemes();
    if (!blocked.includes(normalized)) {
      const updated = [normalized, ...blocked].slice(0, 200);
      await chrome.storage.local.set({ [BLOCKED_THEMES_KEY]: updated });
    }
    showToast("Less like this");
    loadQuote({ forceNew: true });
  }

  function renderThemeChips(quote) {
    if (!themeChipsEl) return;
    themeChipsEl.replaceChildren();
    if (!showThemeChips) return;
    const themes = Array.isArray(quote?.matchedThemes) ? quote.matchedThemes : [];
    if (themes.length === 0) return;

    loadBlockedThemes().then((blocked) => {
      const visibleThemes = themes.map((t) => String(t)).filter((t) => t && !blocked.includes(t.toLowerCase()));
      if (visibleThemes.length === 0) return;
      visibleThemes.slice(0, 6).forEach((theme) => {
        const chip = document.createElement("div");
        chip.className = "theme-chip";

        const name = document.createElement("span");
        name.className = "theme-chip-name";
        name.textContent = theme;
        chip.appendChild(name);

        const less = document.createElement("button");
        less.className = "theme-chip-less";
        less.type = "button";
        less.setAttribute("aria-label", `Less like ${theme}`);
        less.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        less.addEventListener("click", () => blockTheme(theme));
        chip.appendChild(less);

        themeChipsEl.appendChild(chip);
      });
    });
  }

  function getLocalDateKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  async function getDailyQuoteIfAvailable() {
    if (!dailyQuoteEnabled) return null;
    const { [DAILY_QUOTE_KEY]: state } = await chrome.storage.local.get(DAILY_QUOTE_KEY);
    if (!state || !state.dateKey || !state.quote) return null;
    if (state.dateKey !== getLocalDateKey()) return null;
    return state.quote;
  }

  async function setDailyQuote(quote) {
    if (!dailyQuoteEnabled || !quote?.text) return;
    await chrome.storage.local.set({
      [DAILY_QUOTE_KEY]: {
        dateKey: getLocalDateKey(),
        quote: {
          id: quote.id,
          text: quote.text,
          author: quote.author,
          themes: quote.themes || [],
          matchedThemes: quote.matchedThemes || null,
          aiReason: quote.aiReason || null,
        },
      },
    });
  }

  /**
   * Get a random fallback quote
   */
  function getRandomFallback() {
    return LOCAL_FALLBACKS[Math.floor(Math.random() * LOCAL_FALLBACKS.length)];
  }

  /**
   * Check if extension context is valid
   */
  function isExtensionContextValid() {
    try {
      return chrome.runtime && chrome.runtime.id;
    } catch {
      return false;
    }
  }

  /**
   * Load quote directly from storage (doesn't require service worker)
   */
  async function loadQuoteFromStorage() {
    try {
      const { [QUOTES_KEY]: quotes = [] } = await chrome.storage.local.get(QUOTES_KEY);
      if (quotes.length > 0) {
        return quotes[Math.floor(Math.random() * quotes.length)];
      }
    } catch (error) {
      console.warn("[Musing] Could not read from storage:", error);
    }
    return null;
  }

  /**
   * Fetch quote from background worker (with storage fallback)
   */
  async function loadQuote(options = {}) {
    showLoading();
    const forceNew = options.forceNew === true;

    if (!forceNew) {
      try {
        const daily = await getDailyQuoteIfAvailable();
        if (daily && daily.text) {
          displayQuote(daily);
          return;
        }
      } catch {
        // ignore
      }
    }

    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
      console.warn("[Musing] Extension context invalidated, using storage fallback");
      const storageQuote = await loadQuoteFromStorage();
      displayQuote(storageQuote || getRandomFallback());
      return;
    }

    try {
      // Try to get quote from service worker
      const quote = await chrome.runtime.sendMessage({ type: "GET_QUOTE" });
      if (quote && quote.text) {
        displayQuote(quote);
        await setDailyQuote(quote);
      } else {
        // Service worker returned empty, try storage
        const storageQuote = await loadQuoteFromStorage();
        displayQuote(storageQuote || getRandomFallback());
      }
    } catch (error) {
      console.warn("[Musing] Service worker unavailable:", error.message);
      // Fall back to direct storage access
      const storageQuote = await loadQuoteFromStorage();
      displayQuote(storageQuote || getRandomFallback());
    }
  }

  /**
   * Handle search
   */
  function handleSearch(event) {
    if (event.key === "Enter") {
      const query = searchEl.value.trim();
      if (query) {
        let targetUrl;

        // Check if it looks like a URL
        if (query.includes(".") && !query.includes(" ")) {
          // Block dangerous protocols
          const lowerQuery = query.toLowerCase();
          if (lowerQuery.startsWith("javascript:") || lowerQuery.startsWith("data:") || lowerQuery.startsWith("vbscript:")) {
            return;
          }
          targetUrl = query.startsWith("http://") || query.startsWith("https://") ? query : `https://${query}`;
        } else {
          const searchUrl = SEARCH_URLS[searchEngine] || SEARCH_URLS.google;
          targetUrl = `${searchUrl}${encodeURIComponent(query)}`;
        }

        // Validate URL before navigation
        try {
          const parsed = new URL(targetUrl);
          if (parsed.protocol === "https:" || parsed.protocol === "http:") {
            window.location.href = targetUrl;
          }
        } catch {
          // Invalid URL, ignore
        }
      }
    }
  }

  /**
   * Update search placeholder
   */
  function updateSearchPlaceholder() {
    searchEl.placeholder = `Search ${ENGINE_NAMES[searchEngine] || "Google"}...`;
  }

  /**
   * Update engine icon in selector
   */
  function updateEngineIcon() {
    engineIconEl.src = ENGINE_ICONS[searchEngine] || ENGINE_ICONS.google;
    engineIconEl.alt = ENGINE_NAMES[searchEngine] || "Google";
  }

  /**
   * Render dropdown options
   */
  function renderDropdown() {
    const createOption = (key) => {
      const option = document.createElement("div");
      option.className = `engine-option${searchEngine === key ? " selected" : ""}`;
      option.dataset.engine = key;

      const img = document.createElement("img");
      img.className = "engine-option-icon";
      img.src = ENGINE_ICONS[key];
      img.alt = "";
      option.appendChild(img);

      const span = document.createElement("span");
      span.className = "engine-option-name";
      span.textContent = ENGINE_NAMES[key];
      option.appendChild(span);

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "engine-option-check");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "2.5");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      polyline.setAttribute("points", "20 6 9 17 4 12");
      svg.appendChild(polyline);
      option.appendChild(svg);

      option.addEventListener("click", () => selectEngine(key));
      return option;
    };

    engineDropdownEl.replaceChildren();

    // Search engines section
    const searchLabel = document.createElement("div");
    searchLabel.className = "engine-section-label";
    searchLabel.textContent = "Search";
    engineDropdownEl.appendChild(searchLabel);

    SEARCH_ENGINES.forEach((key) => {
      engineDropdownEl.appendChild(createOption(key));
    });

    // Divider
    const divider = document.createElement("div");
    divider.className = "engine-divider";
    engineDropdownEl.appendChild(divider);

    // AI platforms section
    const aiLabel = document.createElement("div");
    aiLabel.className = "engine-section-label";
    aiLabel.textContent = "AI";
    engineDropdownEl.appendChild(aiLabel);

    AI_PLATFORMS.forEach((key) => {
      engineDropdownEl.appendChild(createOption(key));
    });

    // Tools section
    const toolsDivider = document.createElement("div");
    toolsDivider.className = "engine-divider";
    engineDropdownEl.appendChild(toolsDivider);

    const toolsLabel = document.createElement("div");
    toolsLabel.className = "engine-section-label";
    toolsLabel.textContent = "Tools";
    engineDropdownEl.appendChild(toolsLabel);

    TOOLS.forEach((key) => {
      engineDropdownEl.appendChild(createOption(key));
    });
  }

  /**
   * Toggle dropdown open/close
   */
  function toggleDropdown() {
    dropdownOpen = !dropdownOpen;
    engineDropdownEl.classList.toggle("open", dropdownOpen);
    engineSelectorEl.classList.toggle("open", dropdownOpen);
    engineSelectorEl.setAttribute("aria-expanded", dropdownOpen ? "true" : "false");
  }

  /**
   * Close dropdown
   */
  function closeDropdown() {
    if (dropdownOpen) {
      dropdownOpen = false;
      engineDropdownEl.classList.remove("open");
      engineSelectorEl.classList.remove("open");
      engineSelectorEl.setAttribute("aria-expanded", "false");
    }
  }

  /**
   * Select a search engine
   */
  async function selectEngine(key) {
    if (searchEngine !== key) {
      searchEngine = key;
      updateSearchPlaceholder();
      updateEngineIcon();
      renderDropdown();

      // Save preference
      const { [SETTINGS_KEY]: settings = {} } = await chrome.storage.local.get(SETTINGS_KEY);
      settings.searchEngine = key;
      await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    }
    closeDropdown();
    searchEl.focus();
  }

  /**
   * Load settings
   */
  async function loadSettings() {
    const { [SETTINGS_KEY]: settings = {} } = await chrome.storage.local.get(SETTINGS_KEY);
    searchEngine = settings.searchEngine || "google";
    dailyQuoteEnabled = settings.dailyQuoteEnabled ?? false;
    showThemeChips = settings.showThemeChips ?? true;
    updateSearchPlaceholder();
    updateEngineIcon();
    renderDropdown();
    if (currentQuote) {
      renderThemeChips(currentQuote);
    }
  }

  /**
   * Handle refresh click
   */
  function handleRefresh() {
    loadQuote({ forceNew: true });
  }

  /**
   * Listen for storage changes to update settings in real-time
   */
  function setupStorageListener() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && changes[SETTINGS_KEY]) {
        const newSettings = changes[SETTINGS_KEY].newValue || {};
        if (newSettings.searchEngine && newSettings.searchEngine !== searchEngine) {
          searchEngine = newSettings.searchEngine;
          updateSearchPlaceholder();
          updateEngineIcon();
          renderDropdown();
          console.log("[Musing] Search engine updated to:", searchEngine);
        }
        dailyQuoteEnabled = newSettings.dailyQuoteEnabled ?? dailyQuoteEnabled;
        showThemeChips = newSettings.showThemeChips ?? showThemeChips;
        if (currentQuote) {
          renderThemeChips(currentQuote);
        }
      }
    });
  }

  /**
   * Handle visibility change (tab waking up from dormancy)
   */
  function handleVisibilityChange() {
    if (document.visibilityState === "visible") {
      // Re-validate extension context when tab becomes visible
      if (!isExtensionContextValid()) {
        console.log("[Musing] Tab woke up with invalid context, reloading quote from storage");
        loadQuote();
      }
      // Also reload settings in case they changed
      loadSettings();
    }
  }

  /**
   * Initialize the page
   */
  function initialize() {
    if (isInitialized) return;
    isInitialized = true;

    loadSettings();
    loadQuote();
    setupStorageListener();
    setupOnboarding();
    checkOnboarding();
    checkNotifications();
  }

  // Event listeners
  searchEl.addEventListener("keydown", handleSearch);
  refreshEl.addEventListener("click", handleRefresh);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  engineSelectorEl.addEventListener("click", toggleDropdown);
  if (copyQuoteEl) copyQuoteEl.addEventListener("click", copyCurrentQuote);
  if (favoriteQuoteEl) favoriteQuoteEl.addEventListener("click", toggleFavorite);
  if (openHistoryEl) openHistoryEl.addEventListener("click", openHistory);
  if (historyCloseEl) historyCloseEl.addEventListener("click", closeHistory);
  if (historyEl) {
    historyEl.addEventListener("click", (e) => {
      if (e.target === historyEl) {
        closeHistory();
      }
    });
  }

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!engineSelectorEl.contains(e.target) && !engineDropdownEl.contains(e.target)) {
      closeDropdown();
    }
  });

  // Close dropdown on escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && dropdownOpen) {
      closeDropdown();
      searchEl.focus();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && historyEl && historyEl.classList.contains("show")) {
      closeHistory();
      searchEl.focus();
    }
  });

  // ============ Notifications ============

  /**
   * Check for pending notifications
   */
  async function checkNotifications() {
    if (!isExtensionContextValid()) return;

    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_PENDING_NOTIFICATIONS" });
      const notifications = response?.notifications || [];

      if (notifications.length > 0) {
        // Show the first notification
        const notification = notifications[0];
        currentNotification = notification;

        if (notification.type === "update") {
          showUpdateNotificationBanner(notification);
        }
      }
    } catch (error) {
      console.warn("[Musing] Could not check notifications:", error);
    }
  }

  /**
   * Show update notification banner
   */
  function showUpdateNotificationBanner(notification) {
    notificationIconEl.textContent = "🎉";
    notificationTitleEl.textContent = notification.title;
    notificationSubtitleEl.textContent = "Click to see what's new";

    // Show banner with slight delay for smooth animation
    setTimeout(() => {
      notificationBannerEl.classList.add("show");
    }, 500);
  }

  /**
   * Hide notification banner
   */
  function hideNotificationBanner() {
    notificationBannerEl.classList.remove("show");
  }

  /**
   * Show What's New modal for a version
   */
  function showWhatsNewModal(version) {
    const changelog = VERSION_CHANGELOG[version];

    if (changelog) {
      whatsNewIconEl.textContent = changelog.icon;
      whatsNewTitleEl.textContent = changelog.title;
      whatsNewVersionEl.textContent = `Version ${version}`;

      // Render changelog items
      whatsNewListEl.replaceChildren();
      changelog.items.forEach((item) => {
        const itemEl = document.createElement("div");
        itemEl.className = "whats-new-item";

        const iconEl = document.createElement("span");
        iconEl.className = "whats-new-item-icon";
        iconEl.textContent = item.icon;
        itemEl.appendChild(iconEl);

        const textEl = document.createElement("span");
        textEl.className = "whats-new-item-text";
        textEl.textContent = item.text;
        itemEl.appendChild(textEl);

        whatsNewListEl.appendChild(itemEl);
      });
    } else {
      // Generic update message if no specific changelog
      whatsNewIconEl.textContent = "✨";
      whatsNewTitleEl.textContent = "musing has been updated";
      whatsNewVersionEl.textContent = `Version ${version}`;

      whatsNewListEl.replaceChildren();
      const itemEl = document.createElement("div");
      itemEl.className = "whats-new-item";
      const iconEl = document.createElement("span");
      iconEl.className = "whats-new-item-icon";
      iconEl.textContent = "🚀";
      itemEl.appendChild(iconEl);
      const textEl = document.createElement("span");
      textEl.className = "whats-new-item-text";
      textEl.textContent = "Bug fixes and performance improvements";
      itemEl.appendChild(textEl);
      whatsNewListEl.appendChild(itemEl);
    }

    whatsNewEl.classList.add("show");
  }

  /**
   * Hide What's New modal
   */
  function hideWhatsNewModal() {
    whatsNewEl.classList.remove("show");
  }

  /**
   * Dismiss the current notification
   */
  async function dismissCurrentNotification() {
    if (!currentNotification || !isExtensionContextValid()) return;

    try {
      await chrome.runtime.sendMessage({
        type: "DISMISS_NOTIFICATION",
        notificationId: currentNotification.id,
      });
    } catch (error) {
      console.warn("[Musing] Could not dismiss notification:", error);
    }

    currentNotification = null;
    hideNotificationBanner();
  }

  /**
   * Handle notification view click
   */
  function handleNotificationView() {
    if (!currentNotification) return;

    hideNotificationBanner();

    if (currentNotification.type === "update") {
      showWhatsNewModal(currentNotification.currentVersion);
    }
  }

  /**
   * Handle What's New close
   */
  function handleWhatsNewClose() {
    hideWhatsNewModal();
    dismissCurrentNotification();
    searchEl.focus();
  }

  // Notification event listeners
  notificationViewBtnEl.addEventListener("click", handleNotificationView);
  notificationDismissBtnEl.addEventListener("click", dismissCurrentNotification);
  whatsNewCloseBtnEl.addEventListener("click", handleWhatsNewClose);

  // Close What's New on escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && whatsNewEl.classList.contains("show")) {
      handleWhatsNewClose();
    }
  });

  // Close What's New on overlay click
  whatsNewEl.addEventListener("click", (e) => {
    if (e.target === whatsNewEl) {
      handleWhatsNewClose();
    }
  });

  // ============ Onboarding ============

  const onboardingEl = document.getElementById("onboarding");
  const onboardingSteps = document.querySelectorAll(".onboarding-step");
  let currentStep = 1;

  /**
   * Show specific onboarding step
   */
  function showStep(step) {
    currentStep = step;
    onboardingSteps.forEach((stepEl) => {
      const stepNum = parseInt(stepEl.dataset.step);
      stepEl.classList.toggle("active", stepNum === step);
    });
  }

  /**
   * Complete onboarding
   */
  async function completeOnboarding() {
    await chrome.storage.local.set({ [ONBOARDING_KEY]: true });
    onboardingEl.classList.remove("show");
    searchEl.focus();
  }

  /**
   * Check and show onboarding if needed
   */
  async function checkOnboarding() {
    const { [ONBOARDING_KEY]: complete } = await chrome.storage.local.get(ONBOARDING_KEY);
    if (!complete) {
      onboardingEl.classList.add("show");
    }
  }

  /**
   * Setup onboarding event listeners
   */
  function setupOnboarding() {
    // Skip button
    const skipBtn = document.getElementById("onboarding-skip");
    if (skipBtn) {
      skipBtn.addEventListener("click", completeOnboarding);
    }

    // Next button step 1
    const next1Btn = document.getElementById("onboarding-next-1");
    if (next1Btn) {
      next1Btn.addEventListener("click", () => showStep(2));
    }

    // Back button step 2
    const back2Btn = document.getElementById("onboarding-back-2");
    if (back2Btn) {
      back2Btn.addEventListener("click", () => showStep(1));
    }

    // Next button step 2
    const next2Btn = document.getElementById("onboarding-next-2");
    if (next2Btn) {
      next2Btn.addEventListener("click", () => showStep(3));
    }

    // Finish button
    const finishBtn = document.getElementById("onboarding-finish");
    if (finishBtn) {
      finishBtn.addEventListener("click", completeOnboarding);
    }

    // Close on escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && onboardingEl.classList.contains("show")) {
        completeOnboarding();
      }
    });
  }

  // Initialize
  initialize();
})();
