/**
 * Content Script for Claude.ai
 * Extracts conversation text and sends to background worker
 */

(function () {
  "use strict";

  const SCRAPE_INTERVAL_MS = 30000; // 30 seconds
  const MAX_TEXT_LENGTH = 5000;

  let lastScrapedText = "";

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

    console.log("[Musing] Conversation scraped from Claude.ai");
  }

  /**
   * Observe DOM changes for new messages
   */
  function observeChanges() {
    const observer = new MutationObserver((mutations) => {
      // Debounce: only scrape if significant changes
      const hasNewContent = mutations.some(
        (m) => m.addedNodes.length > 0 || m.type === "characterData"
      );

      if (hasNewContent) {
        setTimeout(() => {
          const text = scrapeConversation();
          sendUpdate(text);
        }, 1000); // Wait for DOM to settle
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return observer;
  }

  // Initial scrape after page load
  setTimeout(() => {
    const text = scrapeConversation();
    sendUpdate(text);
  }, 2000);

  // Start observing
  observeChanges();

  // Periodic scrape as backup
  setInterval(() => {
    const text = scrapeConversation();
    sendUpdate(text);
  }, SCRAPE_INTERVAL_MS);

  console.log("[Musing] Claude.ai content script loaded");
})();
