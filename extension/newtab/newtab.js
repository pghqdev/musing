/**
 * New Tab Page Script
 * Displays cached quotes instantly
 */

(function () {
  "use strict";

  const SETTINGS_KEY = "musing_settings";
  const ONBOARDING_KEY = "onboarding_complete";
  const QUOTES_KEY = "cached_quotes";
  const SEARCH_URLS = {
    google: "https://www.google.com/search?q=",
    duckduckgo: "https://duckduckgo.com/?q=",
    bing: "https://www.bing.com/search?q=",
    brave: "https://search.brave.com/search?q=",
  };

  const ENGINE_NAMES = {
    google: "Google",
    duckduckgo: "DuckDuckGo",
    bing: "Bing",
    brave: "Brave",
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
  const containerEl = document.getElementById("container");
  const searchEl = document.getElementById("search");
  const refreshEl = document.getElementById("refresh");
  const loadingEl = document.getElementById("loading-indicator");

  let searchEngine = "google";
  let isInitialized = false;

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
    quoteEl.textContent = quote.text;
    authorEl.textContent = quote.author;
    hideLoading();
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
  async function loadQuote() {
    showLoading();

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
        // Check if it looks like a URL
        if (query.includes(".") && !query.includes(" ")) {
          const url = query.startsWith("http") ? query : `https://${query}`;
          window.location.href = url;
        } else {
          const searchUrl = SEARCH_URLS[searchEngine] || SEARCH_URLS.google;
          window.location.href = `${searchUrl}${encodeURIComponent(query)}`;
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
   * Load settings
   */
  async function loadSettings() {
    const { [SETTINGS_KEY]: settings = {} } = await chrome.storage.local.get(SETTINGS_KEY);
    searchEngine = settings.searchEngine || "google";
    updateSearchPlaceholder();
  }

  /**
   * Handle refresh click
   */
  function handleRefresh() {
    loadQuote();
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
          console.log("[Musing] Search engine updated to:", searchEngine);
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
  }

  // Event listeners
  searchEl.addEventListener("keydown", handleSearch);
  refreshEl.addEventListener("click", handleRefresh);
  document.addEventListener("visibilitychange", handleVisibilityChange);

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
