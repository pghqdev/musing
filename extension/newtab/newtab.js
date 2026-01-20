/**
 * New Tab Page Script
 * Displays cached quotes instantly
 */

(function () {
  "use strict";

  const SETTINGS_KEY = "musing_settings";
  const ONBOARDING_KEY = "onboarding_complete";
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

  const quoteEl = document.getElementById("quote");
  const authorEl = document.getElementById("author");
  const containerEl = document.getElementById("container");
  const searchEl = document.getElementById("search");
  const refreshEl = document.getElementById("refresh");
  const loadingEl = document.getElementById("loading-indicator");

  let searchEngine = "google";

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
   * Fetch quote from background worker
   */
  async function loadQuote() {
    showLoading();

    try {
      const quote = await chrome.runtime.sendMessage({ type: "GET_QUOTE" });
      if (quote && quote.text) {
        displayQuote(quote);
      } else {
        displayQuote({
          text: "The journey of a thousand miles begins with a single step.",
          author: "Lao Tzu",
        });
      }
    } catch (error) {
      console.error("[Musing] Failed to load quote:", error);
      displayQuote({
        text: "To begin, begin.",
        author: "William Wordsworth",
      });
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

  // Event listeners
  searchEl.addEventListener("keydown", handleSearch);
  refreshEl.addEventListener("click", handleRefresh);

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
  loadSettings();
  loadQuote();
  setupStorageListener();
  setupOnboarding();
  checkOnboarding();
})();
