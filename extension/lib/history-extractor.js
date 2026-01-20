/**
 * History Extractor
 * Extracts themes from browser history and search queries
 * All processing happens locally - no data sent externally
 */

// Search engine URL patterns for extracting queries
const SEARCH_ENGINE_PATTERNS = {
  google: {
    hostPattern: /^(www\.)?google\./,
    queryParam: "q",
  },
  bing: {
    hostPattern: /^(www\.)?bing\.com/,
    queryParam: "q",
  },
  duckduckgo: {
    hostPattern: /^(www\.)?duckduckgo\.com/,
    queryParam: "q",
  },
  yahoo: {
    hostPattern: /^(www\.)?(search\.)?yahoo\.com/,
    queryParam: "p",
  },
};

// Domains to exclude from history processing (sensitive/personal content)
const EXCLUDED_DOMAINS = [
  // Banking & Finance
  "bank", "banking", "chase", "wellsfargo", "bankofamerica", "citibank",
  "capitalone", "paypal", "venmo", "zelle", "mint", "quickbooks",
  // Email
  "mail.google", "outlook", "mail.yahoo", "protonmail", "fastmail",
  // Health
  "myhealth", "healthrecords", "patient", "mychart", "webmd", "mayoclinic",
  // Social (personal content)
  "facebook", "instagram", "twitter", "x.com", "linkedin", "tiktok",
  // Shopping/accounts (personal preferences)
  "amazon", "ebay", "walmart",
  // Other sensitive
  "gov", "irs", "ssa", "dmv",
];

// PII patterns to sanitize
const PII_PATTERNS = [
  // Email addresses
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
  // Phone numbers (various formats)
  /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  // SSN
  /\d{3}[-.\s]?\d{2}[-.\s]?\d{4}/g,
  // Credit card numbers
  /\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}/g,
  // IP addresses
  /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g,
];

/**
 * Check if a domain should be excluded
 * @param {string} hostname - The hostname to check
 * @returns {boolean}
 */
function isExcludedDomain(hostname) {
  const lowerHost = hostname.toLowerCase();
  return EXCLUDED_DOMAINS.some((domain) => lowerHost.includes(domain));
}

/**
 * Extract search query from a URL
 * @param {string} urlString - The URL to parse
 * @returns {string|null} - The search query or null
 */
function extractSearchQuery(urlString) {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname;

    for (const [, config] of Object.entries(SEARCH_ENGINE_PATTERNS)) {
      if (config.hostPattern.test(hostname)) {
        const query = url.searchParams.get(config.queryParam);
        if (query && query.trim().length > 0) {
          return sanitizeHistoryText(query.trim());
        }
      }
    }
  } catch {
    // Invalid URL
  }
  return null;
}

/**
 * Sanitize text by removing PII
 * @param {string} text - Text to sanitize
 * @returns {string}
 */
function sanitizeHistoryText(text) {
  if (!text) return "";

  let sanitized = text;
  for (const pattern of PII_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }

  // Remove any remaining potentially sensitive data (long numbers)
  sanitized = sanitized.replace(/\b\d{6,}\b/g, "[REDACTED]");

  return sanitized.trim();
}

/**
 * Extract themes from browser history
 * @param {Object} settings - History settings
 * @param {boolean} settings.enableBrowserHistory - Extract from page titles
 * @param {boolean} settings.enableGoogleSearchHistory - Extract from search queries
 * @param {number} settings.historyDaysBack - Days of history to analyze
 * @param {string[]} settings.excludedDomains - Additional domains to exclude
 * @returns {Promise<{themes: string[], sourceCount: number}>}
 */
async function extractHistoryThemes(settings) {
  const {
    enableBrowserHistory = false,
    enableGoogleSearchHistory = false,
    historyDaysBack = 7,
    excludedDomains = [],
  } = settings;

  if (!enableBrowserHistory && !enableGoogleSearchHistory) {
    return { themes: [], sourceCount: 0 };
  }

  // Check if we have history permission
  const hasPermission = await chrome.permissions.contains({ permissions: ["history"] });
  if (!hasPermission) {
    console.log("[Musing] History permission not granted");
    return { themes: [], sourceCount: 0 };
  }

  // Query history
  const startTime = Date.now() - historyDaysBack * 24 * 60 * 60 * 1000;
  const historyItems = await chrome.history.search({
    text: "",
    startTime,
    maxResults: 500,
  });

  const allExcluded = [...EXCLUDED_DOMAINS, ...excludedDomains];
  const textForExtraction = [];
  const searchQueries = [];
  let sourceCount = 0;

  for (const item of historyItems) {
    if (!item.url) continue;

    try {
      const url = new URL(item.url);
      const hostname = url.hostname;

      // Check if domain is excluded
      if (allExcluded.some((d) => hostname.toLowerCase().includes(d.toLowerCase()))) {
        continue;
      }

      sourceCount++;

      // Extract search queries if enabled
      if (enableGoogleSearchHistory) {
        const query = extractSearchQuery(item.url);
        if (query && query !== "[REDACTED]") {
          searchQueries.push(query);
        }
      }

      // Extract from page titles if enabled
      if (enableBrowserHistory && item.title) {
        const sanitizedTitle = sanitizeHistoryText(item.title);
        if (sanitizedTitle && sanitizedTitle !== "[REDACTED]" && sanitizedTitle.length > 3) {
          textForExtraction.push(sanitizedTitle);
        }
      }
    } catch {
      // Invalid URL, skip
    }
  }

  // Combine search queries and titles
  const combinedText = [
    ...searchQueries.slice(0, 50), // Limit search queries
    ...textForExtraction.slice(0, 100), // Limit titles
  ].join("\n");

  // Use the existing theme extractor (if available)
  let themes = [];
  if (typeof extractThemes === "function") {
    themes = extractThemes(combinedText, 10);
  } else {
    // Fallback: extract simple keywords
    themes = extractSimpleKeywords(combinedText);
  }

  return {
    themes,
    sourceCount,
    searchQueryCount: searchQueries.length,
    titleCount: textForExtraction.length,
  };
}

/**
 * Simple keyword extraction fallback
 * @param {string} text - Text to extract from
 * @returns {string[]}
 */
function extractSimpleKeywords(text) {
  if (!text) return [];

  // Common words to filter out
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
    "be", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "must", "shall", "can", "need",
    "this", "that", "these", "those", "it", "its", "i", "you", "he",
    "she", "we", "they", "what", "which", "who", "when", "where", "why",
    "how", "all", "each", "every", "both", "few", "more", "most", "other",
    "some", "such", "no", "not", "only", "own", "same", "so", "than",
    "too", "very", "just", "also", "now", "here", "there", "then",
    "google", "search", "home", "page", "results", "redacted",
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !stopWords.has(word));

  // Count word frequency
  const wordCounts = {};
  for (const word of words) {
    wordCounts[word] = (wordCounts[word] || 0) + 1;
  }

  // Sort by frequency and return top keywords
  return Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

// Export for use in background script
if (typeof self !== "undefined") {
  self.extractHistoryThemes = extractHistoryThemes;
  self.extractSearchQuery = extractSearchQuery;
  self.sanitizeHistoryText = sanitizeHistoryText;
  self.isExcludedDomain = isExcludedDomain;
}
