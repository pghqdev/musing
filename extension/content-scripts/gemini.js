/**
 * Content Script for Google Gemini (gemini.google.com)
 * Extracts conversation text and sends to background worker
 */

(function () {
  "use strict";

  const SETTINGS_KEY = "musing_settings";
  const SCRAPE_LOG_KEY = "scrape_log";
  const SCRAPE_INTERVAL_MS = 30000; // 30 seconds
  const MAX_TEXT_LENGTH = 5000;
  const DEBOUNCE_MS = 2500;
  const MIN_UPDATE_INTERVAL_MS = 5000;
  const MAX_LOG_ENTRIES = 20;

  let lastScrapedText = "";
  let lastUpdateTime = 0;
  let isEnabled = true;
  let observer = null;
  let scrapeInterval = null;
  let debounceTimeout = null;

  /**
   * Check if Gemini scraping is enabled
   */
  async function checkEnabled() {
    const { [SETTINGS_KEY]: settings = {} } = await chrome.storage.local.get(SETTINGS_KEY);
    isEnabled = settings.enableGemini ?? true;
    return isEnabled;
  }

  /**
   * Sanitize text - remove potentially sensitive patterns
   */
  function sanitizeText(text) {
    if (!text) return "";

    // Remove email addresses
    text = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[email]");

    // Remove URLs with potential auth tokens
    text = text.replace(/https?:\/\/[^\s]+/g, (url) => {
      try {
        const parsed = new URL(url);
        return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
      } catch {
        return "[url]";
      }
    });

    // Remove potential API keys (long alphanumeric strings)
    text = text.replace(/\b[a-zA-Z0-9]{32,}\b/g, "[key]");

    // Remove potential phone numbers
    text = text.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, "[phone]");

    return text;
  }

  /**
   * Validate that text is actual conversation content
   */
  function isValidConversation(text) {
    if (!text || text.length < 50) return false;

    const nonConversationPatterns = [
      /^(Loading|Please wait|Error|404|Not found)/i,
      /^<!DOCTYPE/i,
      /^<html/i,
    ];

    for (const pattern of nonConversationPatterns) {
      if (pattern.test(text.trim())) return false;
    }

    return true;
  }

  /**
   * Extract conversation text from Gemini's UI
   */
  function scrapeConversation() {
    const messages = [];

    // Gemini message selectors
    const selectors = [
      // User messages
      "[data-message-author-role='user']",
      ".user-message",
      "[class*='query-text']",
      // Model responses
      "[data-message-author-role='model']",
      ".model-response",
      "[class*='response-content']",
      ".markdown-main-panel",
      // Generic message containers
      "[class*='message-content']",
      "[class*='conversation-turn']",
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        elements.forEach((el) => {
          const text = el.innerText?.trim();
          if (text && text.length > 10) {
            messages.push(text);
          }
        });
        if (messages.length > 0) break;
      }
    }

    // Fallback: grab main content area
    if (messages.length === 0) {
      const mainContent = document.querySelector("main") ||
                          document.querySelector("[role='main']") ||
                          document.querySelector("[class*='conversation']");
      if (mainContent) {
        const text = mainContent.innerText?.trim();
        if (text && text.length > 50) {
          messages.push(text);
        }
      }
    }

    const combined = messages.join("\n\n").slice(0, MAX_TEXT_LENGTH);
    return sanitizeText(combined);
  }

  /**
   * Scrape conversation sidebar/history for broader context
   */
  function scrapeSidebar() {
    const titles = [];

    // Gemini sidebar selectors for conversation list
    const sidebarSelectors = [
      "[class*='conversation-list'] a",
      "[class*='history'] a",
      "nav a[href*='/app/']",
      "[class*='sidebar'] [class*='item']",
      "[class*='recent-chats'] a",
    ];

    for (const selector of sidebarSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        elements.forEach((el) => {
          const text = el.innerText?.trim();
          // Filter out navigation items, keep conversation titles
          if (text && text.length > 3 && text.length < 200) {
            titles.push(text);
          }
        });
        if (titles.length > 0) break;
      }
    }

    return [...new Set(titles)].slice(0, 20); // Dedupe and limit
  }

  /**
   * Send scrape complete signal to background
   */
  function sendScrapeComplete(sidebarTitles) {
    chrome.runtime.sendMessage(
      {
        type: "SCRAPE_COMPLETE",
        data: {
          platform: "gemini",
          sidebar: sidebarTitles,
          url: window.location.href,
          timestamp: Date.now(),
        },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.debug("[Musing] Failed to send scrape complete:", chrome.runtime.lastError);
        }
      }
    );
  }

  /**
   * Log scrape to storage for debugging
   */
  async function logScrape(text) {
    try {
      const { [SCRAPE_LOG_KEY]: logs = [] } = await chrome.storage.local.get(SCRAPE_LOG_KEY);

      const newLog = {
        source: "gemini",
        timestamp: Date.now(),
        preview: text.slice(0, 200),
        length: text.length,
        url: window.location.href,
      };

      const updatedLogs = [newLog, ...logs].slice(0, MAX_LOG_ENTRIES);
      await chrome.storage.local.set({ [SCRAPE_LOG_KEY]: updatedLogs });
    } catch (error) {
      console.log("[Musing] Failed to log scrape:", error);
    }
  }

  /**
   * Send conversation update to background worker
   */
  function sendUpdate(text) {
    if (!text || text === lastScrapedText) return;

    const now = Date.now();
    if (now - lastUpdateTime < MIN_UPDATE_INTERVAL_MS) {
      return;
    }

    if (!isValidConversation(text)) {
      return;
    }

    lastScrapedText = text;
    lastUpdateTime = now;

    logScrape(text);

    chrome.runtime.sendMessage(
      {
        type: "CONVERSATION_UPDATE",
        data: text,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.log("[Musing] Failed to send update:", chrome.runtime.lastError);
        }
      }
    );

    console.log("[Musing] Conversation scraped from Gemini, length:", text.length);
  }

  /**
   * Debounced scrape function
   */
  function debouncedScrape() {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }
    debounceTimeout = setTimeout(() => {
      const text = scrapeConversation();
      sendUpdate(text);
    }, DEBOUNCE_MS);
  }

  /**
   * Observe DOM changes for new messages
   */
  function observeChanges() {
    observer = new MutationObserver((mutations) => {
      const hasNewContent = mutations.some(
        (m) => m.addedNodes.length > 0 || m.type === "characterData"
      );

      if (hasNewContent) {
        debouncedScrape();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return observer;
  }

  /**
   * Cleanup function
   */
  function cleanup() {
    console.log("[Musing] Cleaning up Gemini content script");

    if (observer) {
      observer.disconnect();
      observer = null;
    }

    if (scrapeInterval) {
      clearInterval(scrapeInterval);
      scrapeInterval = null;
    }

    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
      debounceTimeout = null;
    }
  }

  // Initialize
  async function init() {
    const enabled = await checkEnabled();
    if (!enabled) {
      console.log("[Musing] Gemini scraping disabled in settings");
      return;
    }

    // Initial scrape after page load
    setTimeout(() => {
      const text = scrapeConversation();
      sendUpdate(text);

      // Also scrape sidebar for broader context
      const sidebarTitles = scrapeSidebar();
      if (sidebarTitles.length > 0) {
        console.log("[Musing] Sidebar titles scraped:", sidebarTitles.length);
      }

      // Signal scrape complete (useful for proactive scraping)
      sendScrapeComplete(sidebarTitles);
    }, 2000);

    // Start observing
    observeChanges();

    // Periodic scrape as backup
    scrapeInterval = setInterval(async () => {
      if (await checkEnabled()) {
        const text = scrapeConversation();
        sendUpdate(text);

        // Periodically update sidebar too
        const sidebarTitles = scrapeSidebar();
        sendScrapeComplete(sidebarTitles);
      }
    }, SCRAPE_INTERVAL_MS);

    // Cleanup on page unload
    window.addEventListener("beforeunload", cleanup);
    window.addEventListener("pagehide", cleanup);

    console.log("[Musing] Gemini content script loaded");
  }

  init();
})();
