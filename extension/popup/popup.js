/**
 * Popup Script
 */

const SETTINGS_KEY = "musing_settings";
const AI_SETTINGS_KEY = "ai_settings";
const NOTIFICATION_SETTINGS_KEY = "notification_settings";
const LAST_SYNC_KEY = "last_sync_timestamp";
const CONVERSATIONS_KEY = "recent_conversations";
const QUOTES_KEY = "cached_quotes";
const SCRAPE_LOG_KEY = "scrape_log";

const DEFAULTS = {
  searchEngine: "google",
  enableClaude: true,
  enableChatGPT: true,
  enableGemini: true,
};

const AI_DEFAULTS = {
  aiEnabled: false,
  aiProvider: "groq",
  aiModel: "llama-3.3-70b-versatile",
  aiApiKeys: {
    groq: "",
    claude: "",
    openai: "",
  },
};

const NOTIFICATION_DEFAULTS = {
  showUpdateNotifications: true,
  showPromotions: true,
};

const HISTORY_SETTINGS_KEY = "history_settings";
const HISTORY_DEFAULTS = {
  enableBrowserHistory: false,
  enableGoogleSearchHistory: false,
  historyDaysBack: 7,
  excludedDomains: [],
};

// Pagination constants
const LOGS_PER_PAGE = 10;

// Pagination state
let currentLogsPage = 1;
let totalLogsPages = 1;
let allLogs = [];

// Model options for each provider
const PROVIDER_MODELS = {
  groq: [
    { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
    { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B" },
    { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
  ],
  claude: [
    { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku" },
    { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
  ],
  openai: [
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
  ],
};

// Settings tab elements
const searchEngineEl = document.getElementById("search-engine");
const enableClaudeEl = document.getElementById("enable-claude");
const enableChatGPTEl = document.getElementById("enable-chatgpt");
const enableGeminiEl = document.getElementById("enable-gemini");
const statusEl = document.getElementById("status");
const lastSyncEl = document.getElementById("last-sync");
const syncBtnEl = document.getElementById("sync-btn");
const privacyLinkEl = document.getElementById("privacy-link");
const privacyModalEl = document.getElementById("privacy-modal");
const privacyCloseEl = document.getElementById("privacy-close");

// AI settings elements
const enableAiEl = document.getElementById("enable-ai");
const aiSettingsPanelEl = document.getElementById("ai-settings-panel");
const aiProviderEl = document.getElementById("ai-provider");
const aiModelEl = document.getElementById("ai-model");
const aiApiKeyEl = document.getElementById("ai-api-key");
const apiKeyToggleEl = document.getElementById("api-key-toggle");
const apiKeyLabelEl = document.getElementById("api-key-label");
const getKeyLinkEl = document.getElementById("get-key-link");
const advancedToggleEl = document.getElementById("advanced-toggle");
const advancedPanelEl = document.getElementById("advanced-panel");

// Notification settings elements
const enableUpdateNotificationsEl = document.getElementById("enable-update-notifications");
const enablePromotionsEl = document.getElementById("enable-promotions");

// History settings elements
const enableBrowserHistoryEl = document.getElementById("enable-browser-history");
const enableSearchHistoryEl = document.getElementById("enable-search-history");
const historyDaysEl = document.getElementById("history-days");
const historyDaysRowEl = document.getElementById("history-days-row");
const historyPrivacyNoteEl = document.getElementById("history-privacy-note");

// Provider-specific API key links
const PROVIDER_KEY_URLS = {
  groq: "https://console.groq.com/keys",
  claude: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
};

// Logs tab elements
const logsEmptyEl = document.getElementById("logs-empty");
const logsListEl = document.getElementById("logs-list");
const quotesCountEl = document.getElementById("quotes-count");
const clearLogsBtnEl = document.getElementById("clear-logs-btn");
const viewRawBtnEl = document.getElementById("view-raw-btn");
const rawDataModalEl = document.getElementById("raw-data-modal");
const rawDataCloseEl = document.getElementById("raw-data-close");
const rawDataPreEl = document.getElementById("raw-data-pre");

// Pagination elements
const logsPaginationEl = document.getElementById("logs-pagination");
const logsPrevBtnEl = document.getElementById("logs-prev");
const logsNextBtnEl = document.getElementById("logs-next");
const logsPageInfoEl = document.getElementById("logs-page-info");

// Tab elements
const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");

/**
 * Load settings from storage
 */
async function loadSettings() {
  const { [SETTINGS_KEY]: settings = DEFAULTS } = await chrome.storage.local.get(SETTINGS_KEY);

  searchEngineEl.value = settings.searchEngine || DEFAULTS.searchEngine;
  enableClaudeEl.checked = settings.enableClaude ?? DEFAULTS.enableClaude;
  enableChatGPTEl.checked = settings.enableChatGPT ?? DEFAULTS.enableChatGPT;
  enableGeminiEl.checked = settings.enableGemini ?? DEFAULTS.enableGemini;
}

/**
 * Save settings to storage
 */
async function saveSettings() {
  const settings = {
    searchEngine: searchEngineEl.value,
    enableClaude: enableClaudeEl.checked,
    enableChatGPT: enableChatGPTEl.checked,
    enableGemini: enableGeminiEl.checked,
  };

  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  showStatus("Saved", "success");
}

/**
 * Load AI settings from storage
 */
async function loadAiSettings() {
  const { [AI_SETTINGS_KEY]: aiSettings = AI_DEFAULTS } = await chrome.storage.local.get(AI_SETTINGS_KEY);

  enableAiEl.checked = aiSettings.aiEnabled ?? AI_DEFAULTS.aiEnabled;
  aiProviderEl.value = aiSettings.aiProvider || AI_DEFAULTS.aiProvider;

  // Get the current provider and load its API key
  const currentProvider = aiSettings.aiProvider || AI_DEFAULTS.aiProvider;
  const apiKeys = aiSettings.aiApiKeys || AI_DEFAULTS.aiApiKeys;

  // Support legacy single apiKey format (migrate to per-provider)
  if (aiSettings.aiApiKey && !aiSettings.aiApiKeys) {
    aiApiKeyEl.value = aiSettings.aiApiKey;
  } else {
    aiApiKeyEl.value = apiKeys[currentProvider] || "";
  }

  // Update model options and provider UI for current provider
  updateModelOptions(currentProvider);
  updateProviderUI(currentProvider);

  // Set saved model if available
  if (aiSettings.aiModel) {
    aiModelEl.value = aiSettings.aiModel;
  }

  // Show/hide AI settings panel based on toggle
  updateAiPanelVisibility();
}

/**
 * Save AI settings to storage
 */
async function saveAiSettings() {
  // First get existing settings to preserve other provider keys
  const { [AI_SETTINGS_KEY]: existingSettings = AI_DEFAULTS } = await chrome.storage.local.get(AI_SETTINGS_KEY);

  // Get existing keys or initialize
  const existingKeys = existingSettings.aiApiKeys || AI_DEFAULTS.aiApiKeys;

  // Update the key for the current provider
  const currentProvider = aiProviderEl.value;
  const updatedKeys = {
    ...existingKeys,
    [currentProvider]: aiApiKeyEl.value,
  };

  const aiSettings = {
    aiEnabled: enableAiEl.checked,
    aiProvider: currentProvider,
    aiModel: aiModelEl.value,
    aiApiKeys: updatedKeys,
  };

  await chrome.storage.local.set({ [AI_SETTINGS_KEY]: aiSettings });
  showStatus("Saved", "success");
}

/**
 * Update model options based on selected provider
 */
function updateModelOptions(provider) {
  const models = PROVIDER_MODELS[provider] || PROVIDER_MODELS.groq;

  // Clear existing options
  aiModelEl.replaceChildren();

  // Add new options
  models.forEach((model) => {
    const option = document.createElement("option");
    option.value = model.value;
    option.textContent = model.label;
    aiModelEl.appendChild(option);
  });
}

/**
 * Update AI settings panel visibility
 */
function updateAiPanelVisibility() {
  aiSettingsPanelEl.classList.toggle("show", enableAiEl.checked);
}

/**
 * Handle provider change
 */
async function handleProviderChange() {
  const newProvider = aiProviderEl.value;

  // Save current key before switching
  await saveAiSettings();

  // Load the key for the new provider
  const { [AI_SETTINGS_KEY]: aiSettings = AI_DEFAULTS } = await chrome.storage.local.get(AI_SETTINGS_KEY);
  const apiKeys = aiSettings.aiApiKeys || AI_DEFAULTS.aiApiKeys;
  aiApiKeyEl.value = apiKeys[newProvider] || "";

  // Update UI for new provider
  updateModelOptions(newProvider);
  updateProviderUI(newProvider);
}

/**
 * Update provider-specific UI (label and key link)
 */
function updateProviderUI(provider) {
  // Update API key label
  const providerNames = {
    groq: "Groq",
    claude: "Claude",
    openai: "OpenAI",
  };
  apiKeyLabelEl.textContent = `${providerNames[provider] || "API"} API Key`;

  // Update "Get free key" link
  const url = PROVIDER_KEY_URLS[provider] || PROVIDER_KEY_URLS.groq;
  getKeyLinkEl.href = url;

  // Update link text based on provider (Groq is free, others are paid)
  getKeyLinkEl.textContent = provider === "groq" ? "Get free key" : "Get API key";

  // Re-add the external link icon
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("width", "10");
  icon.setAttribute("height", "10");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "2");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  icon.innerHTML = `<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line>`;
  getKeyLinkEl.appendChild(document.createTextNode(" "));
  getKeyLinkEl.appendChild(icon);
}

/**
 * Toggle API key visibility
 */
function toggleApiKeyVisibility() {
  const isPassword = aiApiKeyEl.type === "password";
  aiApiKeyEl.type = isPassword ? "text" : "password";

  // Update the eye icon
  const eyeIcon = document.getElementById("eye-icon");
  if (isPassword) {
    // Show "eye-off" icon (key is visible)
    eyeIcon.innerHTML = `
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
      <line x1="1" y1="1" x2="23" y2="23"></line>
    `;
  } else {
    // Show "eye" icon (key is hidden)
    eyeIcon.innerHTML = `
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    `;
  }
}

/**
 * Toggle advanced settings panel
 */
function toggleAdvancedPanel() {
  const isExpanded = advancedPanelEl.classList.toggle("show");
  advancedToggleEl.classList.toggle("expanded", isExpanded);
}

/**
 * Load notification settings from storage
 */
async function loadNotificationSettings() {
  const { [NOTIFICATION_SETTINGS_KEY]: settings = NOTIFICATION_DEFAULTS } =
    await chrome.storage.local.get(NOTIFICATION_SETTINGS_KEY);

  enableUpdateNotificationsEl.checked = settings.showUpdateNotifications ?? NOTIFICATION_DEFAULTS.showUpdateNotifications;
  enablePromotionsEl.checked = settings.showPromotions ?? NOTIFICATION_DEFAULTS.showPromotions;
}

/**
 * Save notification settings to storage
 */
async function saveNotificationSettings() {
  const settings = {
    showUpdateNotifications: enableUpdateNotificationsEl.checked,
    showPromotions: enablePromotionsEl.checked,
  };

  await chrome.storage.local.set({ [NOTIFICATION_SETTINGS_KEY]: settings });
  showStatus("Saved", "success");
}

/**
 * Load history settings from storage
 */
async function loadHistorySettings() {
  const { [HISTORY_SETTINGS_KEY]: settings = HISTORY_DEFAULTS } =
    await chrome.storage.local.get(HISTORY_SETTINGS_KEY);

  enableBrowserHistoryEl.checked = settings.enableBrowserHistory ?? HISTORY_DEFAULTS.enableBrowserHistory;
  enableSearchHistoryEl.checked = settings.enableGoogleSearchHistory ?? HISTORY_DEFAULTS.enableGoogleSearchHistory;
  historyDaysEl.value = settings.historyDaysBack ?? HISTORY_DEFAULTS.historyDaysBack;

  updateHistoryUIVisibility();
}

/**
 * Save history settings to storage
 */
async function saveHistorySettings() {
  const settings = {
    enableBrowserHistory: enableBrowserHistoryEl.checked,
    enableGoogleSearchHistory: enableSearchHistoryEl.checked,
    historyDaysBack: parseInt(historyDaysEl.value, 10),
    excludedDomains: HISTORY_DEFAULTS.excludedDomains,
  };

  await chrome.storage.local.set({ [HISTORY_SETTINGS_KEY]: settings });
  showStatus("Saved", "success");

  // Trigger history processing if any history source is enabled
  if (settings.enableBrowserHistory || settings.enableGoogleSearchHistory) {
    triggerHistoryProcessing();
  }
}

/**
 * Update history UI visibility based on settings
 */
function updateHistoryUIVisibility() {
  const anyHistoryEnabled = enableBrowserHistoryEl.checked || enableSearchHistoryEl.checked;
  historyDaysRowEl.style.display = anyHistoryEnabled ? "flex" : "none";
  historyPrivacyNoteEl.style.display = anyHistoryEnabled ? "block" : "none";
}

/**
 * Check if history permission is granted
 */
async function checkHistoryPermission() {
  try {
    return await chrome.permissions.contains({ permissions: ["history"] });
  } catch {
    return false;
  }
}

/**
 * Request history permission
 */
async function requestHistoryPermission() {
  try {
    const granted = await chrome.permissions.request({ permissions: ["history"] });
    return granted;
  } catch (error) {
    console.error("Failed to request history permission:", error);
    return false;
  }
}

/**
 * Handle history toggle change
 * Requests permission if needed
 */
async function handleHistoryToggle(toggle, settingKey) {
  if (toggle.checked) {
    // Check if permission is already granted
    const hasPermission = await checkHistoryPermission();

    if (!hasPermission) {
      // Request permission
      const granted = await requestHistoryPermission();

      if (!granted) {
        // Permission denied, revert toggle
        toggle.checked = false;
        showStatus("Permission required", "error");
        return;
      }
    }
  }

  updateHistoryUIVisibility();
  await saveHistorySettings();
}

/**
 * Trigger history processing in background
 */
async function triggerHistoryProcessing() {
  try {
    await chrome.runtime.sendMessage({ type: "PROCESS_HISTORY" });
    console.log("[Musing] History processing triggered");
  } catch (error) {
    console.warn("Failed to trigger history processing:", error);
  }
}

/**
 * Mask a single API key
 */
function maskApiKey(key) {
  if (!key) return "";
  if (key.length > 8) {
    return key.slice(0, 4) + "****" + key.slice(-4);
  } else if (key.length > 0) {
    return "****";
  }
  return "";
}

/**
 * Mask sensitive data in an object (for display purposes)
 */
function maskSensitiveData(data) {
  const masked = JSON.parse(JSON.stringify(data));

  // Mask API keys in ai_settings
  if (masked.ai_settings) {
    // Handle new per-provider keys format
    if (masked.ai_settings.aiApiKeys) {
      for (const provider of Object.keys(masked.ai_settings.aiApiKeys)) {
        masked.ai_settings.aiApiKeys[provider] = maskApiKey(masked.ai_settings.aiApiKeys[provider]);
      }
    }
    // Handle legacy single key format
    if (masked.ai_settings.aiApiKey) {
      masked.ai_settings.aiApiKey = maskApiKey(masked.ai_settings.aiApiKey);
    }
  }

  return masked;
}

/**
 * Show saved status briefly
 * @param {string} message - Status message
 * @param {"success" | "error"} type - Status type
 */
function showStatus(message = "Saved", type = "success") {
  statusEl.textContent = message;
  statusEl.classList.remove("error", "success");
  statusEl.classList.add("show", type);
  setTimeout(() => {
    statusEl.classList.remove("show", "error", "success");
  }, 2000);
}

/**
 * Load and display last sync time
 */
async function loadLastSync() {
  const { [LAST_SYNC_KEY]: timestamp } = await chrome.storage.local.get(LAST_SYNC_KEY);

  if (timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    let timeAgo;
    if (diffMins < 1) {
      timeAgo = "Just now";
    } else if (diffMins < 60) {
      timeAgo = `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
    } else if (diffHours < 24) {
      timeAgo = `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
    } else {
      timeAgo = `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
    }

    lastSyncEl.textContent = timeAgo;
  } else {
    lastSyncEl.textContent = "Never";
  }
}

/**
 * Trigger manual sync
 */
async function handleSync() {
  syncBtnEl.disabled = true;
  syncBtnEl.textContent = "Syncing...";

  try {
    const response = await chrome.runtime.sendMessage({ type: "FORCE_SYNC" });
    await loadLastSync();

    if (response && response.error) {
      showStatus(response.error, "error");
    } else if (response && response.skipped) {
      showStatus("Already synced recently", "success");
    } else {
      showStatus("Synced successfully", "success");
    }
  } catch (error) {
    console.error("Sync failed:", error);
    showStatus("Sync failed - check connection", "error");
  } finally {
    syncBtnEl.disabled = false;
    syncBtnEl.textContent = "Sync Now";
  }
}

/**
 * Show privacy modal
 */
function showPrivacyModal(event) {
  event.preventDefault();
  privacyModalEl.classList.add("show");
}

/**
 * Hide privacy modal
 */
function hidePrivacyModal() {
  privacyModalEl.classList.remove("show");
}

/**
 * Switch tabs
 */
function switchTab(tabName) {
  tabBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  tabContents.forEach((content) => {
    content.classList.toggle("active", content.id === `tab-${tabName}`);
  });

  // Load logs data when switching to logs tab
  if (tabName === "logs") {
    loadLogs();
  }
}

/**
 * Load and display scrape logs
 */
async function loadLogs() {
  const data = await chrome.storage.local.get([SCRAPE_LOG_KEY, CONVERSATIONS_KEY, QUOTES_KEY]);
  const logs = data[SCRAPE_LOG_KEY] || [];
  const conversations = data[CONVERSATIONS_KEY] || [];
  const quotes = data[QUOTES_KEY] || [];

  // Update quotes count
  quotesCountEl.textContent = `${quotes.length} quotes cached`;

  // If no scrape logs but we have conversations, show them instead
  allLogs = logs.length > 0 ? logs : conversations.map((text, i) => ({
    source: "unknown",
    timestamp: Date.now() - (i * 60000),
    preview: text.slice(0, 100),
    length: text.length,
  }));

  if (allLogs.length === 0) {
    logsEmptyEl.style.display = "block";
    logsListEl.replaceChildren();
    logsPaginationEl.classList.add("hidden");
    return;
  }

  logsEmptyEl.style.display = "none";

  // Calculate pagination
  totalLogsPages = Math.ceil(allLogs.length / LOGS_PER_PAGE);
  currentLogsPage = Math.min(currentLogsPage, totalLogsPages);

  renderLogsPage();
  updatePaginationUI();
}

/**
 * Render the current page of logs
 */
function renderLogsPage() {
  const startIndex = (currentLogsPage - 1) * LOGS_PER_PAGE;
  const endIndex = Math.min(startIndex + LOGS_PER_PAGE, allLogs.length);
  const pageData = allLogs.slice(startIndex, endIndex);

  // Use DOM APIs instead of innerHTML to prevent XSS
  logsListEl.replaceChildren();
  pageData.forEach((log) => {
    const time = new Date(log.timestamp).toLocaleString();
    const sourceName = log.source === "claude" ? "Claude.ai" :
                       log.source === "chatgpt" ? "ChatGPT" :
                       log.source === "gemini" ? "Gemini" : "Unknown";
    const preview = log.preview || (typeof log === "string" ? log.slice(0, 100) : "");

    const logItem = document.createElement("div");
    logItem.className = "log-item";

    const sourceDiv = document.createElement("div");
    sourceDiv.className = "log-source";
    sourceDiv.textContent = sourceName + " ";
    const timeSpan = document.createElement("span");
    timeSpan.className = "log-time";
    timeSpan.textContent = time;
    sourceDiv.appendChild(timeSpan);

    const previewDiv = document.createElement("div");
    previewDiv.className = "log-preview";
    previewDiv.textContent = preview + (log.length > 100 ? "..." : "");

    logItem.appendChild(sourceDiv);
    logItem.appendChild(previewDiv);
    logsListEl.appendChild(logItem);
  });
}

/**
 * Update pagination UI state
 */
function updatePaginationUI() {
  // Show/hide pagination based on total pages
  if (totalLogsPages <= 1) {
    logsPaginationEl.classList.add("hidden");
  } else {
    logsPaginationEl.classList.remove("hidden");
    logsPageInfoEl.textContent = `${currentLogsPage} / ${totalLogsPages}`;
    logsPrevBtnEl.disabled = currentLogsPage <= 1;
    logsNextBtnEl.disabled = currentLogsPage >= totalLogsPages;
  }
}

/**
 * Go to previous logs page
 */
function goToPrevPage() {
  if (currentLogsPage > 1) {
    currentLogsPage--;
    renderLogsPage();
    updatePaginationUI();
  }
}

/**
 * Go to next logs page
 */
function goToNextPage() {
  if (currentLogsPage < totalLogsPages) {
    currentLogsPage++;
    renderLogsPage();
    updatePaginationUI();
  }
}

/**
 * Escape HTML entities
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Clear all scrape data
 */
async function handleClearLogs() {
  if (!confirm("Clear all scraped conversation data and cached quotes?")) {
    return;
  }

  await chrome.storage.local.remove([SCRAPE_LOG_KEY, CONVERSATIONS_KEY, QUOTES_KEY]);
  showStatus("Data cleared", "success");

  // Reset pagination state
  currentLogsPage = 1;
  totalLogsPages = 1;
  allLogs = [];

  loadLogs();
}

/**
 * Show raw storage data
 */
async function handleViewRaw() {
  const data = await chrome.storage.local.get(null);
  const maskedData = maskSensitiveData(data);
  rawDataPreEl.textContent = JSON.stringify(maskedData, null, 2);
  rawDataModalEl.classList.add("show");
}

/**
 * Hide raw data modal
 */
function hideRawDataModal() {
  rawDataModalEl.classList.remove("show");
}

// Event listeners - Settings
searchEngineEl.addEventListener("change", saveSettings);
enableClaudeEl.addEventListener("change", saveSettings);
enableChatGPTEl.addEventListener("change", saveSettings);
enableGeminiEl.addEventListener("change", saveSettings);
syncBtnEl.addEventListener("click", handleSync);
privacyLinkEl.addEventListener("click", showPrivacyModal);
privacyCloseEl.addEventListener("click", hidePrivacyModal);
privacyModalEl.addEventListener("click", (e) => {
  if (e.target === privacyModalEl) hidePrivacyModal();
});

// Event listeners - AI Settings
enableAiEl.addEventListener("change", () => {
  updateAiPanelVisibility();
  saveAiSettings();
});
aiProviderEl.addEventListener("change", handleProviderChange);
aiModelEl.addEventListener("change", saveAiSettings);
aiApiKeyEl.addEventListener("change", saveAiSettings);
aiApiKeyEl.addEventListener("blur", saveAiSettings);
apiKeyToggleEl.addEventListener("click", toggleApiKeyVisibility);
advancedToggleEl.addEventListener("click", toggleAdvancedPanel);

// Event listeners - Notification Settings
enableUpdateNotificationsEl.addEventListener("change", saveNotificationSettings);
enablePromotionsEl.addEventListener("change", saveNotificationSettings);

// Event listeners - History Settings
enableBrowserHistoryEl.addEventListener("change", () => handleHistoryToggle(enableBrowserHistoryEl, "enableBrowserHistory"));
enableSearchHistoryEl.addEventListener("change", () => handleHistoryToggle(enableSearchHistoryEl, "enableGoogleSearchHistory"));
historyDaysEl.addEventListener("change", saveHistorySettings);

// Event listeners - Tabs
tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

// Event listeners - Logs
clearLogsBtnEl.addEventListener("click", handleClearLogs);
viewRawBtnEl.addEventListener("click", handleViewRaw);
rawDataCloseEl.addEventListener("click", hideRawDataModal);
rawDataModalEl.addEventListener("click", (e) => {
  if (e.target === rawDataModalEl) hideRawDataModal();
});

// Event listeners - Pagination
logsPrevBtnEl.addEventListener("click", goToPrevPage);
logsNextBtnEl.addEventListener("click", goToNextPage);

// Load on popup open
loadSettings();
loadAiSettings();
loadNotificationSettings();
loadHistorySettings();
loadLastSync();
