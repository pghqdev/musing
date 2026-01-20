/**
 * Popup Script
 */

const SETTINGS_KEY = "musing_settings";
const LAST_SYNC_KEY = "last_sync_timestamp";

const DEFAULTS = {
  searchEngine: "google",
  enableClaude: true,
  enableChatGPT: true,
};

const searchEngineEl = document.getElementById("search-engine");
const enableClaudeEl = document.getElementById("enable-claude");
const enableChatGPTEl = document.getElementById("enable-chatgpt");
const statusEl = document.getElementById("status");
const lastSyncEl = document.getElementById("last-sync");
const syncBtnEl = document.getElementById("sync-btn");

/**
 * Load settings from storage
 */
async function loadSettings() {
  const { [SETTINGS_KEY]: settings = DEFAULTS } = await chrome.storage.local.get(SETTINGS_KEY);

  searchEngineEl.value = settings.searchEngine || DEFAULTS.searchEngine;
  enableClaudeEl.checked = settings.enableClaude ?? DEFAULTS.enableClaude;
  enableChatGPTEl.checked = settings.enableChatGPT ?? DEFAULTS.enableChatGPT;
}

/**
 * Save settings to storage
 */
async function saveSettings() {
  const settings = {
    searchEngine: searchEngineEl.value,
    enableClaude: enableClaudeEl.checked,
    enableChatGPT: enableChatGPTEl.checked,
  };

  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  showStatus();
}

/**
 * Show saved status briefly
 */
function showStatus(message = "Saved") {
  statusEl.textContent = message;
  statusEl.classList.add("show");
  setTimeout(() => {
    statusEl.classList.remove("show");
  }, 1200);
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
    await chrome.runtime.sendMessage({ type: "FORCE_SYNC" });
    await loadLastSync();
    showStatus("Synced");
  } catch (error) {
    console.error("Sync failed:", error);
    showStatus("Sync failed");
  } finally {
    syncBtnEl.disabled = false;
    syncBtnEl.textContent = "Sync Now";
  }
}

// Event listeners
searchEngineEl.addEventListener("change", saveSettings);
enableClaudeEl.addEventListener("change", saveSettings);
enableChatGPTEl.addEventListener("change", saveSettings);
syncBtnEl.addEventListener("click", handleSync);

// Load on popup open
loadSettings();
loadLastSync();
