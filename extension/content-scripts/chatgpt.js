/**
 * Content Script for ChatGPT (chatgpt.com)
 * Extracts conversation text and sends to background worker
 */

(function () {
  "use strict";

  const SETTINGS_KEY = "musing_settings";
  const SCRAPE_INTERVAL_MS = 30000; // 30 seconds
  const MAX_TEXT_LENGTH = 5000;

  let lastScrapedText = "";
  let isEnabled = true;

  /**
   * Check if ChatGPT scraping is enabled
   */
  async function checkEnabled() {
    const { [SETTINGS_KEY]: settings = {} } = await chrome.storage.local.get(SETTINGS_KEY);
    isEnabled = settings.enableChatGPT ?? true;
    return isEnabled;
  }

  /**
   * Extract conversation text from ChatGPT's UI
   */
  function scrapeConversation() {
    const messages = [];

    // ChatGPT message selectors (as of late 2024)
    const selectors = [
      "[data-message-author-role='user']",
      "[data-message-author-role='assistant']",
      "[class*='agent-turn']",
      "[class*='user-turn']",
      ".markdown",
      "[class*='ConversationItem']",
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

    // Fallback: grab the main thread container
    if (messages.length === 0) {
      const thread = document.querySelector("[class*='thread']") ||
                     document.querySelector("main");
      if (thread) {
        const text = thread.innerText?.trim();
        if (text && text.length > 50) {
          messages.push(text);
        }
      }
    }

    return messages.join("\n\n").slice(0, MAX_TEXT_LENGTH);
  }

  /**
   * Send conversation update to background worker
   */
  function sendUpdate(text) {
    if (!text || text === lastScrapedText) return;

    lastScrapedText = text;

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

    console.log("[Musing] Conversation scraped from ChatGPT");
  }

  /**
   * Observe DOM changes for new messages
   */
  function observeChanges() {
    const observer = new MutationObserver((mutations) => {
      const hasNewContent = mutations.some(
        (m) => m.addedNodes.length > 0 || m.type === "characterData"
      );

      if (hasNewContent) {
        setTimeout(() => {
          const text = scrapeConversation();
          sendUpdate(text);
        }, 1000);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return observer;
  }

  // Initialize
  async function init() {
    const enabled = await checkEnabled();
    if (!enabled) {
      console.log("[Musing] ChatGPT scraping disabled in settings");
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
    setInterval(async () => {
      if (await checkEnabled()) {
        const text = scrapeConversation();
        sendUpdate(text);
      }
    }, SCRAPE_INTERVAL_MS);

    console.log("[Musing] ChatGPT content script loaded");
  }

  init();
})();
