/**
 * Content Script for Claude.ai
 * Extracts conversation text and sends to background worker
 */

(function () {
  "use strict";

  const SETTINGS_KEY = "musing_settings";
  const SCRAPE_LOG_KEY = "scrape_log";
  const SCRAPE_INTERVAL_MS = 30000; // 30 seconds
  const MAX_TEXT_LENGTH = 5000;
  const DEBOUNCE_MS = 2500; // Increased from 1s to 2.5s
  const MIN_UPDATE_INTERVAL_MS = 5000; // Minimum 5s between updates
  const MAX_LOG_ENTRIES = 20;

  let lastScrapedText = "";
  let lastUpdateTime = 0;
  let isEnabled = true;
  let observer = null;
  let scrapeInterval = null;
  let debounceTimeout = null;

  /**
   * Check if Claude scraping is enabled
   */
  async function checkEnabled() {
    const { [SETTINGS_KEY]: settings = {} } = await chrome.storage.local.get(SETTINGS_KEY);
    isEnabled = settings.enableClaude ?? true;
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
        // Keep domain, remove query params that might contain tokens
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

    // Filter out likely non-conversation content
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
   * Extract conversation text from Claude's UI
   */
  function scrapeConversation() {
    const messages = [];

    // Try multiple selectors (Claude's DOM changes frequently)
    const selectors = [
      "[data-testid='user-message']",
      "[data-testid='assistant-message']",
      ".font-user-message",
      ".font-claude-message",
      "[class*='ConversationTurn']",
      "[class*='Message']",
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
        break; // Use first working selector
      }
    }

    // Fallback: grab main content area
    if (messages.length === 0) {
      const mainContent = document.querySelector("main");
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
   * Log scrape to storage for debugging
   */
  async function logScrape(text) {
    try {
      const { [SCRAPE_LOG_KEY]: logs = [] } = await chrome.storage.local.get(SCRAPE_LOG_KEY);

      const newLog = {
        source: "claude",
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

    // Rate limiting
    const now = Date.now();
    if (now - lastUpdateTime < MIN_UPDATE_INTERVAL_MS) {
      return;
    }

    // Validate content
    if (!isValidConversation(text)) {
      return;
    }

    lastScrapedText = text;
    lastUpdateTime = now;

    // Log the scrape for debugging
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

    console.log("[Musing] Conversation scraped from Claude.ai, length:", text.length);
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
      // Debounce: only scrape if significant changes
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
   * Cleanup function to disconnect observer and clear intervals
   */
  function cleanup() {
    console.log("[Musing] Cleaning up Claude.ai content script");

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
      console.log("[Musing] Claude.ai scraping disabled in settings");
      return;
    }

    // Initial scrape after page load
    setTimeout(() => {
      const text = scrapeConversation();
      sendUpdate(text);
    }, 2000);

    // Start observing
    observeChanges();

    // Periodic scrape as backup
    scrapeInterval = setInterval(async () => {
      if (await checkEnabled()) {
        const text = scrapeConversation();
        sendUpdate(text);
      }
    }, SCRAPE_INTERVAL_MS);

    // Cleanup on page unload
    window.addEventListener("beforeunload", cleanup);
    window.addEventListener("pagehide", cleanup);

    console.log("[Musing] Claude.ai content script loaded");
  }

  init();
})();
