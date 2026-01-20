/**
 * API Interceptor - Runs in page context
 * Intercepts fetch/XHR to capture conversation API responses
 * Sends data to content script via postMessage
 */

(function () {
  "use strict";

  const MUSING_MESSAGE_TYPE = "MUSING_API_CAPTURE";

  // API endpoint patterns to monitor
  const ENDPOINT_PATTERNS = {
    claude: [
      /\/api\/organizations\/[^/]+\/chat_conversations\/[^/]+\/completion/,
      /\/api\/organizations\/[^/]+\/chat_conversations/,
      /\/api\/append_message/,
    ],
    chatgpt: [
      /\/backend-api\/conversation$/,
      /\/backend-api\/conversation\/[^/]+$/,
      /\/backend-api\/conversation\/[^/]+\/messages/,
    ],
    gemini: [
      /\/_\/BardChatUi\/data\/assistant\.lamda\.BardFrontendService\/StreamGenerate/,
      /\/batchexecute.*BardFrontendService/,
    ],
  };

  /**
   * Detect which platform we're on
   */
  function detectPlatform() {
    const hostname = window.location.hostname;
    if (hostname.includes("claude.ai")) return "claude";
    if (hostname.includes("chatgpt.com")) return "chatgpt";
    if (hostname.includes("gemini.google.com")) return "gemini";
    return null;
  }

  /**
   * Check if URL matches any endpoint pattern for the current platform
   */
  function isConversationEndpoint(url, platform) {
    if (!platform || !ENDPOINT_PATTERNS[platform]) return false;

    const urlString = typeof url === "string" ? url : url.toString();
    return ENDPOINT_PATTERNS[platform].some((pattern) => pattern.test(urlString));
  }

  /**
   * Extract conversation text from Claude API response
   */
  function extractClaudeData(data) {
    try {
      // Claude streams responses, data might be in various formats
      if (typeof data === "string") {
        // Try to parse streaming response (multiple JSON objects separated by newlines)
        const lines = data.split("\n").filter((line) => line.trim());
        const messages = [];

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.completion) {
              messages.push(parsed.completion);
            }
            if (parsed.content && Array.isArray(parsed.content)) {
              parsed.content.forEach((block) => {
                if (block.text) messages.push(block.text);
              });
            }
          } catch {
            // Not JSON, might be raw text
          }
        }

        return messages.join("");
      }

      if (data && typeof data === "object") {
        if (data.completion) return data.completion;
        if (data.content) {
          if (Array.isArray(data.content)) {
            return data.content.map((b) => b.text || "").join("");
          }
          return data.content;
        }
      }
    } catch (e) {
      console.debug("[Musing API] Failed to extract Claude data:", e);
    }
    return null;
  }

  /**
   * Extract conversation text from ChatGPT API response
   */
  function extractChatGPTData(data) {
    try {
      if (typeof data === "string") {
        // ChatGPT uses SSE format: data: {json}\n\n
        const lines = data.split("\n").filter((line) => line.startsWith("data: "));
        const messages = [];

        for (const line of lines) {
          const jsonStr = line.slice(6); // Remove "data: " prefix
          if (jsonStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.message?.content?.parts) {
              messages.push(...parsed.message.content.parts);
            }
          } catch {
            // Not valid JSON
          }
        }

        return messages.join("");
      }

      if (data && typeof data === "object") {
        if (data.message?.content?.parts) {
          return data.message.content.parts.join("");
        }
      }
    } catch (e) {
      console.debug("[Musing API] Failed to extract ChatGPT data:", e);
    }
    return null;
  }

  /**
   * Extract conversation text from Gemini API response
   */
  function extractGeminiData(data) {
    try {
      if (typeof data === "string") {
        // Gemini uses a complex batch response format
        // Try to find text content within the response
        const textMatches = data.match(/"text":"([^"]+)"/g);
        if (textMatches) {
          return textMatches.map((m) => {
            const match = m.match(/"text":"([^"]+)"/);
            return match ? match[1] : "";
          }).join(" ");
        }
      }

      if (data && typeof data === "object") {
        // Try common Gemini response structures
        if (data.candidates?.[0]?.content?.parts) {
          return data.candidates[0].content.parts.map((p) => p.text || "").join("");
        }
      }
    } catch (e) {
      console.debug("[Musing API] Failed to extract Gemini data:", e);
    }
    return null;
  }

  /**
   * Process captured API response
   */
  function processCapturedData(data, platform) {
    let text = null;

    switch (platform) {
      case "claude":
        text = extractClaudeData(data);
        break;
      case "chatgpt":
        text = extractChatGPTData(data);
        break;
      case "gemini":
        text = extractGeminiData(data);
        break;
    }

    if (text && text.length > 20) {
      window.postMessage(
        {
          type: MUSING_MESSAGE_TYPE,
          platform,
          text,
          timestamp: Date.now(),
          source: "api",
        },
        "*"
      );
    }
  }

  /**
   * Wrap fetch to intercept responses
   */
  function wrapFetch(platform) {
    const originalFetch = window.fetch;

    window.fetch = async function (...args) {
      const [url] = args;
      const response = await originalFetch.apply(this, args);

      if (isConversationEndpoint(url, platform)) {
        try {
          const clone = response.clone();
          const contentType = clone.headers.get("content-type") || "";

          // Handle different response types
          if (contentType.includes("text/event-stream") || contentType.includes("text/plain")) {
            // Streaming response - read as text
            clone.text().then((text) => {
              processCapturedData(text, platform);
            }).catch(() => {});
          } else if (contentType.includes("application/json")) {
            clone.json().then((data) => {
              processCapturedData(data, platform);
            }).catch(() => {});
          } else {
            // Try text as fallback
            clone.text().then((text) => {
              processCapturedData(text, platform);
            }).catch(() => {});
          }
        } catch (e) {
          console.debug("[Musing API] Failed to process fetch response:", e);
        }
      }

      return response;
    };
  }

  /**
   * Wrap XMLHttpRequest to intercept responses
   */
  function wrapXHR(platform) {
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this._musingUrl = url;
      return originalXHROpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (...args) {
      if (isConversationEndpoint(this._musingUrl, platform)) {
        this.addEventListener("load", function () {
          try {
            const contentType = this.getResponseHeader("content-type") || "";
            let data = this.responseText;

            if (contentType.includes("application/json")) {
              try {
                data = JSON.parse(data);
              } catch {
                // Keep as text
              }
            }

            processCapturedData(data, platform);
          } catch (e) {
            console.debug("[Musing API] Failed to process XHR response:", e);
          }
        });
      }

      return originalXHRSend.apply(this, args);
    };
  }

  // Initialize
  const platform = detectPlatform();

  if (platform) {
    console.log("[Musing API] Interceptor initialized for", platform);
    wrapFetch(platform);
    wrapXHR(platform);
  }
})();
