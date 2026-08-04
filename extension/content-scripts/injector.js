/**
 * Injector Content Script
 * Injects api-interceptor.js into the page context and bridges messages to background
 */

(function () {
  "use strict";

  const MUSING_MESSAGE_TYPE = "MUSING_API_CAPTURE";

  let isEnabled = true;

  /**
   * Check if API interception is enabled in settings
   */
  async function checkEnabled() {
    try {
      const settings = await Store.settings.get();
      isEnabled = settings.enableApiCapture;
      return isEnabled;
    } catch {
      return true;
    }
  }

  /**
   * Inject the API interceptor script into page context
   */
  function injectScript() {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("inject/api-interceptor.js");
    script.onload = function () {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  }

  /**
   * Sanitize captured text before sending to background
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

    // Remove potential API keys
    text = text.replace(/\b[a-zA-Z0-9]{32,}\b/g, "[key]");

    // Remove potential phone numbers
    text = text.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, "[phone]");

    return text;
  }

  /**
   * Handle messages from the injected script
   */
  function handleMessage(event) {
    // Validate source and origin for security
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;
    if (!event.data || event.data.type !== MUSING_MESSAGE_TYPE) return;

    const { platform, text, source } = event.data;

    if (!text || text.length < 20) return;

    const sanitized = sanitizeText(text);

    // Forward to background worker
    chrome.runtime.sendMessage(
      {
        type: "API_CAPTURE",
        data: {
          platform,
          text: sanitized.slice(0, 5000), // Limit size
          source,
          url: window.location.href,
          timestamp: Date.now(),
        },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.debug("[Musing Injector] Failed to send to background:", chrome.runtime.lastError);
        }
      }
    );

    console.log("[Musing Injector] API capture forwarded, length:", sanitized.length);
  }

  /**
   * Initialize the injector
   */
  async function init() {
    const enabled = await checkEnabled();
    if (!enabled) {
      console.log("[Musing Injector] API capture disabled in settings");
      return;
    }

    // Listen for messages from injected script
    window.addEventListener("message", handleMessage);

    // Inject the API interceptor into page context
    injectScript();

    console.log("[Musing Injector] Initialized");
  }

  // Run on page load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
