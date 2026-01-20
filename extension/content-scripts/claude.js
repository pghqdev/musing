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
  let periodicTimeout = null;

  /**
   * Check if Claude scraping is enabled
   */
  async function checkEnabled() {
    const { [SETTINGS_KEY]: settings = {} } = await chrome.storage.local.get(SETTINGS_KEY);
    isEnabled = settings.enableClaude ?? true;
    return isEnabled;
  }

  /**
   * Common UI noise patterns to filter out
   */
  const UI_NOISE_PATTERNS = [
    // Claude-specific UI
    /^(New chat|Recents|Starred|Projects|Settings)$/i,
    /^(Claude|Upgrade|Pro|Free)$/i,
    /^(Start a new chat|How can I help|What would you like)$/i,
    /^(Copy|Retry|Edit|Good response|Bad response)$/i,
    // Common navigation/UI
    /^(Home|Settings|Profile|Menu|Close|Cancel|OK|Submit)$/i,
    /^(Loading|Please wait|Thinking|Generating)\.{0,3}$/i,
    /^(Today|Yesterday|Previous \d+ days|Last week|Last month)$/i,
    // Single emoji or very short
    /^[\p{Emoji}\s]{1,5}$/u,
    // Just numbers or punctuation
    /^[\d\s\.\,\-\:\;]+$/,
  ];

  /**
   * Sanitize text - remove sensitive patterns and UI noise
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

    // Filter out UI noise line by line
    const lines = text.split("\n");
    const filteredLines = lines.filter((line) => {
      const trimmed = line.trim();
      // Skip empty or very short lines
      if (!trimmed || trimmed.length < 3) return false;
      // Skip lines matching UI noise patterns
      for (const pattern of UI_NOISE_PATTERNS) {
        if (pattern.test(trimmed)) return false;
      }
      // Skip very short lines that look like menu items (< 20 chars, no spaces)
      if (trimmed.length < 20 && !trimmed.includes(" ")) return false;
      return true;
    });

    // Remove duplicate consecutive lines
    const deduped = filteredLines.filter((line, i, arr) => {
      return i === 0 || line.trim() !== arr[i - 1].trim();
    });

    return deduped.join("\n").trim();
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

    // Only use first 10 messages for context
    const limited = messages.slice(0, 10);
    const combined = limited.join("\n\n").slice(0, MAX_TEXT_LENGTH);
    return sanitizeText(combined);
  }

  /**
   * Check if text is a valid conversation title (not UI noise)
   */
  function isValidTitle(text) {
    if (!text || text.length < 5 || text.length > 200) return false;
    // Filter out UI noise
    for (const pattern of UI_NOISE_PATTERNS) {
      if (pattern.test(text)) return false;
    }
    // Filter out short single-word items that look like menu items
    if (text.length < 15 && !text.includes(" ")) return false;
    return true;
  }

  /**
   * Scrape conversation sidebar/history for broader context
   */
  function scrapeSidebar() {
    const titles = [];

    // Claude sidebar selectors for conversation list
    const sidebarSelectors = [
      "nav [data-testid='conversation-list'] a",
      "nav a[href^='/chat/']",
      "[class*='sidebar'] a[href^='/chat/']",
      "[class*='ConversationList'] a",
      "aside a[href^='/chat/']",
    ];

    for (const selector of sidebarSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        elements.forEach((el) => {
          const text = el.innerText?.trim();
          if (isValidTitle(text)) {
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
          platform: "claude",
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

  function findObserverRoot() {
    const candidates = [
      "[data-testid='user-message']",
      "[data-testid='assistant-message']",
      ".font-user-message",
      ".font-claude-message",
      "[class*='ConversationTurn']",
      "[class*='Message']",
      "main",
    ];

    for (const selector of candidates) {
      const el = document.querySelector(selector);
      if (el) {
        return el.closest("main") || el.parentElement || document.body;
      }
    }
    return document.body;
  }

  /**
   * Observe DOM changes for new messages
   */
  function observeChanges() {
    // Ensure document.body exists before observing
    if (!document.body) {
      console.log("[Musing] document.body not ready, retrying...");
      setTimeout(observeChanges, 100);
      return null;
    }

    const root = findObserverRoot();

    observer = new MutationObserver((mutations) => {
      // Debounce: only scrape if significant changes
      const hasNewContent = mutations.some(
        (m) => m.addedNodes.length > 0 || m.type === "characterData"
      );

      if (hasNewContent) {
        debouncedScrape();
      }
    });

    observer.observe(root, {
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

    if (periodicTimeout) {
      clearTimeout(periodicTimeout);
      periodicTimeout = null;
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

    const schedulePeriodicScrape = async (delayMs) => {
      periodicTimeout = setTimeout(async () => {
        if (await checkEnabled()) {
          const text = scrapeConversation();
          const isLikelyChange = text && text !== lastScrapedText;
          sendUpdate(text);

          const sidebarTitles = scrapeSidebar();
          sendScrapeComplete(sidebarTitles);

          schedulePeriodicScrape(isLikelyChange ? SCRAPE_INTERVAL_MS : 120000);
          return;
        }
        schedulePeriodicScrape(120000);
      }, delayMs);
    };

    schedulePeriodicScrape(SCRAPE_INTERVAL_MS);

    // Cleanup on page unload
    window.addEventListener("beforeunload", cleanup);
    window.addEventListener("pagehide", cleanup);

    console.log("[Musing] Claude.ai content script loaded");
  }

  init();
})();
