/**
 * New Tab Page Script
 * Displays cached quotes instantly
 */

(function () {
  "use strict";

  const quoteEl = document.getElementById("quote");
  const authorEl = document.getElementById("author");
  const containerEl = document.getElementById("container");
  const searchEl = document.getElementById("search");
  const refreshEl = document.getElementById("refresh");

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
          window.location.href = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        }
      }
    }
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

  // Load quote on page load
  loadQuote();
})();
