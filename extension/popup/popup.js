/**
 * Popup Script
 */

const SETTINGS_KEY = "musing_settings";
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

// Logs tab elements
const logsEmptyEl = document.getElementById("logs-empty");
const logsListEl = document.getElementById("logs-list");
const quotesCountEl = document.getElementById("quotes-count");
const clearLogsBtnEl = document.getElementById("clear-logs-btn");
const viewRawBtnEl = document.getElementById("view-raw-btn");
const rawDataModalEl = document.getElementById("raw-data-modal");
const rawDataCloseEl = document.getElementById("raw-data-close");
const rawDataPreEl = document.getElementById("raw-data-pre");

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
  const displayData = logs.length > 0 ? logs : conversations.map((text, i) => ({
    source: "unknown",
    timestamp: Date.now() - (i * 60000),
    preview: text.slice(0, 100),
    length: text.length,
  }));

  if (displayData.length === 0) {
    logsEmptyEl.style.display = "block";
    logsListEl.innerHTML = "";
    return;
  }

  logsEmptyEl.style.display = "none";

  // Use DOM APIs instead of innerHTML to prevent XSS
  logsListEl.replaceChildren();
  displayData.forEach((log) => {
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
  loadLogs();
}

/**
 * Show raw storage data
 */
async function handleViewRaw() {
  const data = await chrome.storage.local.get(null);
  rawDataPreEl.textContent = JSON.stringify(data, null, 2);
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

// Load on popup open
loadSettings();
loadLastSync();
