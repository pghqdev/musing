/**
 * New Tab Page Script
 * Displays cached quotes instantly
 */

(function () {
  "use strict";

  const SETTINGS_KEY = "musing_settings";
  const SEARCH_URLS = {
    google: "https://www.google.com/search?q=",
    duckduckgo: "https://duckduckgo.com/?q=",
    bing: "https://www.bing.com/search?q=",
    brave: "https://search.brave.com/search?q=",
  };

  const quoteEl = document.getElementById("quote");
  const authorEl = document.getElementById("author");
  const containerEl = document.getElementById("container");
  const searchEl = document.getElementById("search");
  const refreshEl = document.getElementById("refresh");

  let searchEngine = "google";

  /**
   * Display a quote
   */
  function displayQuote(quote) {
    quoteEl.textContent = quote.text;
    authorEl.textContent = quote.author;
    containerEl.classList.remove("loading");
  }

  /**
   * Fetch quote from background worker
   */
  async function loadQuote() {
    containerEl.classList.add("loading");

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
   * Load settings
   */
  async function loadSettings() {
    const { [SETTINGS_KEY]: settings = {} } = await chrome.storage.local.get(SETTINGS_KEY);
    searchEngine = settings.searchEngine || "google";

    // Update placeholder to show current search engine
    const engineNames = { google: "Google", duckduckgo: "DuckDuckGo", bing: "Bing", brave: "Brave" };
    searchEl.placeholder = `Search ${engineNames[searchEngine] || "Google"}...`;
  }

  /**
   * Handle refresh click
   */
  function handleRefresh(event) {
    event.preventDefault();
    loadQuote();
  }

  // Event listeners
  searchEl.addEventListener("keydown", handleSearch);
  refreshEl.addEventListener("click", handleRefresh);

  // Load settings and quote on page load
  loadSettings();
  loadQuote();
})();
