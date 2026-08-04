/**
 * AI Reason Generator
 * Generates personalized contextual reasons for quote recommendations using AI APIs
 */

// Cache for AI-generated reasons to avoid duplicate API calls
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get the API key for the current provider from settings
 * Supports both legacy single key and new per-provider keys format
 * @param {Object} settings - AI settings
 * @returns {string|null} The API key or null
 */
function getApiKey(settings) {
  if (!settings) return null;

  // New per-provider format
  if (settings.aiApiKeys && settings.aiProvider) {
    return settings.aiApiKeys[settings.aiProvider] || null;
  }

  // Legacy single key format
  return settings.aiApiKey || null;
}

/**
 * Generate an AI-powered contextual reason for a quote
 * @param {Object} quote - The quote object with text and author
 * @param {string[]} conversations - Recent conversation snippets
 * @param {Object} settings - AI settings with provider, apiKey/apiKeys, model
 * @returns {Promise<string|null>} The generated reason or null on failure
 */
async function generateAIReason(quote, conversations, settings) {
  const apiKey = getApiKey(settings);
  if (!settings || !settings.aiEnabled || !apiKey) {
    return null;
  }

  // Check cache first
  const cacheKey = createCacheKey(quote.id, conversations);
  const cached = await getCachedReason(cacheKey);
  if (cached) {
    console.log("[Musing] Using cached AI reason");
    return cached;
  }

  const prompt = buildPrompt(quote, conversations);

  try {
    let reason = null;
    const timeout = 10000; // 10 second timeout

    switch (settings.aiProvider) {
      case "groq":
        reason = await callGroqAPI(prompt, apiKey, settings.aiModel || "llama-3.3-70b-versatile", timeout);
        break;
      case "claude":
        reason = await callClaudeAPI(prompt, apiKey, settings.aiModel || "claude-3-haiku-20240307", timeout);
        break;
      case "openai":
        reason = await callOpenAIAPI(prompt, apiKey, settings.aiModel || "gpt-4o-mini", timeout);
        break;
      default:
        console.warn("[Musing] Unknown AI provider:", settings.aiProvider);
        return null;
    }

    if (reason) {
      // Cache the result
      await cacheReason(cacheKey, reason);
      return reason;
    }
  } catch (error) {
    console.warn("[Musing] AI reason generation failed:", error.message);
  }

  return null;
}

/**
 * Build the prompt for the AI
 * @param {Object} quote - Quote with text and author
 * @param {string[]} conversations - Recent conversation snippets
 * @returns {string} The prompt
 */
function buildPrompt(quote, conversations) {
  const conversationText = conversations.slice(0, 3).join("\n\n---\n\n");

  return `You show quotes to users based on their recent AI conversations. Write a short, natural reason (4-8 words) connecting this quote to what they've been working on.

QUOTE: "${quote.text}" - ${quote.author}

RECENT CONVERSATIONS:
${conversationText || "No recent conversations available."}

Rules:
- Start with "you" or "your" (e.g., "you've been...", "your recent...")
- Sound casual and human, like a friend explaining why they shared something
- Focus on what they're DOING, not "relevance" or abstract connections
- No ending period, start lowercase

Good examples:
- "you've been debugging that tricky async issue"
- "your work on the authentication flow"
- "you've been thinking about career growth"
- "your questions about system design"
- "you've been exploring new frameworks"

Bad examples (never write like this):
- "the relevance to your programming work"
- "the connection between the quote and coding"
- "relevant to your recent discussions"

Reason:`;
}

/**
 * Call the Groq API
 * @param {string} prompt - The prompt to send
 * @param {string} apiKey - Groq API key
 * @param {string} model - Model to use
 * @param {number} timeout - Request timeout in ms
 * @returns {Promise<string|null>} The generated reason
 */
async function callGroqAPI(prompt, apiKey, model, timeout) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 50,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.warn("[Musing] Groq API error:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    return cleanReason(content);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      console.warn("[Musing] Groq API timeout");
    } else {
      console.warn("[Musing] Groq API error:", error.message);
    }
    return null;
  }
}

/**
 * Call the Claude (Anthropic) API
 * @param {string} prompt - The prompt to send
 * @param {string} apiKey - Anthropic API key
 * @param {string} model - Model to use
 * @param {number} timeout - Request timeout in ms
 * @returns {Promise<string|null>} The generated reason
 */
async function callClaudeAPI(prompt, apiKey, model, timeout) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 50,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.warn("[Musing] Claude API error:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;
    return cleanReason(content);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      console.warn("[Musing] Claude API timeout");
    } else {
      console.warn("[Musing] Claude API error:", error.message);
    }
    return null;
  }
}

/**
 * Call the OpenAI API
 * @param {string} prompt - The prompt to send
 * @param {string} apiKey - OpenAI API key
 * @param {string} model - Model to use
 * @param {number} timeout - Request timeout in ms
 * @returns {Promise<string|null>} The generated reason
 */
async function callOpenAIAPI(prompt, apiKey, model, timeout) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 50,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.warn("[Musing] OpenAI API error:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    return cleanReason(content);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      console.warn("[Musing] OpenAI API timeout");
    } else {
      console.warn("[Musing] OpenAI API error:", error.message);
    }
    return null;
  }
}

/**
 * Clean the AI-generated reason
 * @param {string} content - Raw AI response
 * @returns {string|null} Cleaned reason
 */
function cleanReason(content) {
  if (!content) return null;

  let reason = content.trim();

  // Remove quotes if present
  if ((reason.startsWith('"') && reason.endsWith('"')) ||
      (reason.startsWith("'") && reason.endsWith("'"))) {
    reason = reason.slice(1, -1);
  }

  // Remove trailing period
  if (reason.endsWith(".")) {
    reason = reason.slice(0, -1);
  }

  // Ensure lowercase start
  if (reason.length > 0) {
    reason = reason.charAt(0).toLowerCase() + reason.slice(1);
  }

  // Validate length (3-15 words is ideal for a natural reason)
  const wordCount = reason.split(/\s+/).length;
  if (wordCount < 2 || wordCount > 20) {
    console.warn("[Musing] AI reason has unexpected length:", wordCount);
    return null;
  }

  // Reject unnatural patterns - these sound robotic
  const unnaturalPatterns = [
    /^the relevance/i,
    /^the connection/i,
    /^relevant to/i,
    /^this relates/i,
    /^because of the/i,
    /^given your/i,
    /^in light of/i,
    /^considering your/i,
  ];

  for (const pattern of unnaturalPatterns) {
    if (pattern.test(reason)) {
      console.warn("[Musing] AI reason rejected - unnatural pattern:", reason);
      return null;
    }
  }

  return reason;
}

/**
 * Create a cache key from quote ID and conversations
 * @param {string} quoteId - Quote ID
 * @param {string[]} conversations - Conversations
 * @returns {string} Cache key
 */
function createCacheKey(quoteId, conversations) {
  // Use a simple hash of the first conversation snippet
  const conversationHash = conversations.length > 0
    ? simpleHash(conversations[0].slice(0, 200))
    : "no-conv";
  return `${quoteId}-${conversationHash}`;
}

/**
 * Simple string hash function
 * @param {string} str - String to hash
 * @returns {string} Hash
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Get cached reason
 * @param {string} cacheKey - Cache key
 * @returns {Promise<string|null>} Cached reason or null
 */
async function getCachedReason(cacheKey) {
  try {
    const cache = await Store.ai.getReasonCache();
    const entry = cache[cacheKey];

    if (entry && (Date.now() - entry.timestamp) < CACHE_TTL_MS) {
      return entry.reason;
    }

    // Clean up expired entry
    if (entry) {
      delete cache[cacheKey];
      await Store.ai.setReasonCache(cache);
    }
  } catch (error) {
    console.warn("[Musing] Cache read error:", error.message);
  }
  return null;
}

/**
 * Cache a reason
 * @param {string} cacheKey - Cache key
 * @param {string} reason - Reason to cache
 */
async function cacheReason(cacheKey, reason) {
  try {
    const cache = await Store.ai.getReasonCache();

    // Limit cache size to 100 entries
    const keys = Object.keys(cache);
    if (keys.length >= 100) {
      // Remove oldest entries
      const sortedKeys = keys.sort((a, b) => (cache[a].timestamp || 0) - (cache[b].timestamp || 0));
      sortedKeys.slice(0, 20).forEach((key) => delete cache[key]);
    }

    cache[cacheKey] = {
      reason,
      timestamp: Date.now(),
    };

    await Store.ai.setReasonCache(cache);
  } catch (error) {
    console.warn("[Musing] Cache write error:", error.message);
  }
}

// Export for service worker
if (typeof self !== "undefined") {
  self.generateAIReason = generateAIReason;
}
