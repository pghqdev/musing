/**
 * New Tab Page Script
 * Displays cached quotes instantly
 */

(function () {
  "use strict";

  // Contextual reasons for each theme - explains why a quote was recommended
  const THEME_REASONS = {
    programming: "you've been writing code",
    debugging: "you've been troubleshooting code",
    architecture: "you've been designing systems",
    algorithms: "you've been working on algorithms",
    learning: "you're exploring new concepts",
    growth: "you're focused on self-improvement",
    frustration: "you've been working through a challenge",
    curiosity: "you're exploring something new",
    excitement: "you've had a breakthrough",
    anxiety: "you're navigating uncertainty",
    career: "you're thinking about your career",
    relationships: "you're thinking about relationships",
    health: "you're focused on wellbeing",
    finance: "you're thinking about finances",
    persistence: "you're pushing through difficulty",
    patience: "you're playing the long game",
    simplicity: "you're simplifying things",
    complexity: "you're tackling something complex",
    wisdom: "you're seeking deeper understanding",
    productivity: "you're optimizing your workflow",
    motivation: "you're looking for inspiration",
    writing: "you've been writing",
    creativity: "you're brainstorming ideas",
    "decision-making": "you're weighing options",
    uncertainty: "you're navigating the unknown",
    "problem-solving": "you're solving problems",
    success: "you're chasing goals",
    failure: "you're learning from setbacks",
    time: "you're managing your time",
    communication: "you're working on communication",
    change: "you're navigating change",
    philosophy: "you're reflecting on life",
    courage: "you're facing something difficult",
    fear: "you're confronting fears",
  };

  // Version changelog - keyed by version number
  // Add entries when releasing new versions
  const VERSION_CHANGELOG = {
    "1.1.0": {
      icon: "✨",
      title: "What's New in v1.1.0",
      items: [
        { icon: "⭐", text: "Save favorite quotes and export them anytime" },
        { icon: "�️", text: "Daily quote mode for a calmer new tab" },
        { icon: "🏷️", text: "Theme chips with “less like this” controls" },
        { icon: "�", text: "Quote history plus one-click copy" },
        { icon: "🔕", text: "New proactive refresh toggle to avoid surprise tabs" },
      ],
    },
    // Add more versions as needed
  };

  // Local fallback quotes (used when service worker is unavailable)
  const LOCAL_FALLBACKS = [
    { text: "The journey of a thousand miles begins with a single step.", author: "Lao Tzu" },
    { text: "To begin, begin.", author: "William Wordsworth" },
    { text: "The only true wisdom is in knowing you know nothing.", author: "Socrates" },
    { text: "In the middle of difficulty lies opportunity.", author: "Albert Einstein" },
    { text: "The mind is everything. What you think you become.", author: "Buddha" },
  ];

  const quoteEl = document.getElementById("quote");
  const authorEl = document.getElementById("author");
  const reasonEl = document.getElementById("recommendation-reason");
  const containerEl = document.getElementById("container");
  const refreshEl = document.getElementById("refresh");
  const loadingEl = document.getElementById("loading-indicator");
  const toastEl = document.getElementById("toast");
  const copyQuoteEl = document.getElementById("copy-quote");
  const favoriteQuoteEl = document.getElementById("favorite-quote");
  const favoriteQuoteLabelEl = document.getElementById("favorite-quote-label");
  const themeChipsEl = document.getElementById("theme-chips");

  // Notification elements
  const notificationBannerEl = document.getElementById("notification-banner");
  const notificationIconEl = document.getElementById("notification-icon");
  const notificationTitleEl = document.getElementById("notification-title");
  const notificationSubtitleEl = document.getElementById("notification-subtitle");
  const notificationViewBtnEl = document.getElementById("notification-view");
  const notificationDismissBtnEl = document.getElementById("notification-dismiss");

  // What's New modal elements
  const whatsNewEl = document.getElementById("whats-new");
  const whatsNewIconEl = document.getElementById("whats-new-icon");
  const whatsNewTitleEl = document.getElementById("whats-new-title");
  const whatsNewVersionEl = document.getElementById("whats-new-version");
  const whatsNewListEl = document.getElementById("whats-new-list");
  const whatsNewCloseBtnEl = document.getElementById("whats-new-close");

  let isInitialized = false;
  let currentNotification = null;
  let currentQuote = null;
  let toastTimeout = null;
  let dailyQuoteEnabled = false;
  let showThemeChips = true;

  /**
   * Show loading state
   */
  function showLoading() {
    containerEl.classList.add("loading");
    if (loadingEl) {
      loadingEl.classList.add("show");
    }
  }

  /**
   * Hide loading state
   */
  function hideLoading() {
    containerEl.classList.remove("loading");
    if (loadingEl) {
      loadingEl.classList.remove("show");
    }
  }

  /**
   * Display a quote
   */
  function displayQuote(quote) {
    if (!quote || !quote.text) {
      quote = getRandomFallback();
    }

    currentQuote = quote;
    quoteEl.textContent = quote.text;
    authorEl.textContent = quote.author;

    // Display recommendation reason - prioritize AI reason over theme-based
    if (quote.aiReason) {
      // Use AI-generated contextual reason
      reasonEl.textContent = quote.aiReason;
      reasonEl.classList.add("show");
    } else if (quote.matchedThemes && quote.matchedThemes.length > 0) {
      // Fall back to theme-based reason
      const primaryTheme = quote.matchedThemes[0];
      const reason = THEME_REASONS[primaryTheme] || `you're exploring ${primaryTheme}`;
      reasonEl.textContent = reason;
      reasonEl.classList.add("show");
    } else {
      reasonEl.textContent = "";
      reasonEl.classList.remove("show");
    }

    hideLoading();
    renderThemeChips(quote);
    updateFavoriteButtonState();
    Store.history.recordShown(quote);
  }

  function showToast(message) {
    if (!toastEl) return;
    if (toastTimeout) {
      clearTimeout(toastTimeout);
      toastTimeout = null;
    }
    toastEl.textContent = message;
    toastEl.classList.add("show");
    toastTimeout = setTimeout(() => {
      toastEl.classList.remove("show");
    }, 1600);
  }

  async function copyCurrentQuote() {
    if (!currentQuote || !currentQuote.text) return;
    const text = `"${currentQuote.text}" — ${currentQuote.author || ""}`.trim();
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied");
    } catch {
      try {
        const el = document.createElement("textarea");
        el.value = text;
        el.setAttribute("readonly", "true");
        el.style.position = "fixed";
        el.style.left = "-9999px";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        el.remove();
        showToast("Copied");
      } catch {
        showToast("Copy failed");
      }
    }
  }

  async function updateFavoriteButtonState() {
    if (!favoriteQuoteEl || !currentQuote?.id) return;
    const isFavorited = await Store.favorites.isFavorite(currentQuote.id);
    favoriteQuoteEl.classList.toggle("selected", isFavorited);
    favoriteQuoteEl.setAttribute("aria-pressed", isFavorited ? "true" : "false");
    if (favoriteQuoteLabelEl) {
      favoriteQuoteLabelEl.textContent = isFavorited ? "Saved" : "Save";
    }
  }

  async function toggleFavorite() {
    if (!currentQuote || !currentQuote.id) return;
    const { favorited } = await Store.favorites.toggle(currentQuote);
    showToast(favorited ? "Saved" : "Removed");
    updateFavoriteButtonState();
  }

  async function blockTheme(theme) {
    await Store.themes.block(theme);
    showToast("Less like this");
    loadQuote({ forceNew: true });
  }

  function renderThemeChips(quote) {
    if (!themeChipsEl) return;
    themeChipsEl.replaceChildren();
    if (!showThemeChips) return;
    const themes = Array.isArray(quote?.matchedThemes) ? quote.matchedThemes : [];
    if (themes.length === 0) return;

    Store.themes.blocked().then((blocked) => {
      const visibleThemes = themes.map((t) => String(t)).filter((t) => t && !blocked.includes(t.toLowerCase()));
      if (visibleThemes.length === 0) return;
      visibleThemes.slice(0, 6).forEach((theme) => {
        const chip = document.createElement("div");
        chip.className = "theme-chip";

        const name = document.createElement("span");
        name.className = "theme-chip-name";
        name.textContent = theme;
        chip.appendChild(name);

        const less = document.createElement("button");
        less.className = "theme-chip-less";
        less.type = "button";
        less.setAttribute("aria-label", `Less like ${theme}`);
        less.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        less.addEventListener("click", () => blockTheme(theme));
        chip.appendChild(less);

        themeChipsEl.appendChild(chip);
      });
    });
  }

  function getLocalDateKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  async function getDailyQuoteIfAvailable() {
    if (!dailyQuoteEnabled) return null;
    const state = await Store.quotes.getDailyState();
    if (!state || !state.dateKey || !state.quote) return null;
    if (state.dateKey !== getLocalDateKey()) return null;
    return state.quote;
  }

  async function setDailyQuote(quote) {
    if (!dailyQuoteEnabled || !quote?.text) return;
    await Store.quotes.setDailyState({
      dateKey: getLocalDateKey(),
      quote: {
        id: quote.id,
        text: quote.text,
        author: quote.author,
        themes: quote.themes || [],
        matchedThemes: quote.matchedThemes || null,
        aiReason: quote.aiReason || null,
      },
    });
  }

  /**
   * Get a random fallback quote
   */
  function getRandomFallback() {
    return LOCAL_FALLBACKS[Math.floor(Math.random() * LOCAL_FALLBACKS.length)];
  }

  /**
   * Check if extension context is valid
   */
  function isExtensionContextValid() {
    try {
      return chrome.runtime && chrome.runtime.id;
    } catch {
      return false;
    }
  }

  /**
   * Load quote directly from storage (doesn't require service worker)
   */
  async function loadQuoteFromStorage() {
    try {
      const quotes = await Store.quotes.getCache();
      if (quotes.length > 0) {
        return quotes[Math.floor(Math.random() * quotes.length)];
      }
    } catch (error) {
      console.warn("[Musing] Could not read from storage:", error);
    }
    return null;
  }

  /**
   * Fetch quote from background worker (with storage fallback)
   */
  async function loadQuote(options = {}) {
    showLoading();
    const forceNew = options.forceNew === true;

    if (!forceNew) {
      try {
        const daily = await getDailyQuoteIfAvailable();
        if (daily && daily.text) {
          displayQuote(daily);
          return;
        }
      } catch {
        // ignore
      }
    }

    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
      console.warn("[Musing] Extension context invalidated, using storage fallback");
      const storageQuote = await loadQuoteFromStorage();
      displayQuote(storageQuote || getRandomFallback());
      return;
    }

    try {
      // Try to get quote from service worker
      const quote = await chrome.runtime.sendMessage({ type: "GET_QUOTE" });
      if (quote && quote.text) {
        displayQuote(quote);
        await setDailyQuote(quote);
      } else {
        // Service worker returned empty, try storage
        const storageQuote = await loadQuoteFromStorage();
        displayQuote(storageQuote || getRandomFallback());
      }
    } catch (error) {
      console.warn("[Musing] Service worker unavailable:", error.message);
      // Fall back to direct storage access
      const storageQuote = await loadQuoteFromStorage();
      displayQuote(storageQuote || getRandomFallback());
    }
  }

  /**
   * Load settings
   */
  async function loadSettings() {
    const settings = await Store.settings.get();
    dailyQuoteEnabled = settings.dailyQuoteEnabled;
    showThemeChips = settings.showThemeChips;
    if (currentQuote) {
      renderThemeChips(currentQuote);
    }
  }

  /**
   * Handle refresh click
   */
  function handleRefresh() {
    loadQuote({ forceNew: true });
  }

  /**
   * Listen for storage changes to update settings in real-time
   */
  function setupStorageListener() {
    Store.settings.onChanged((newSettings) => {
      dailyQuoteEnabled = newSettings.dailyQuoteEnabled;
      showThemeChips = newSettings.showThemeChips;
      if (currentQuote) {
        renderThemeChips(currentQuote);
      }
    });
  }

  /**
   * Handle visibility change (tab waking up from dormancy)
   */
  function handleVisibilityChange() {
    if (document.visibilityState === "visible") {
      // Re-validate extension context when tab becomes visible
      if (!isExtensionContextValid()) {
        console.log("[Musing] Tab woke up with invalid context, reloading quote from storage");
        loadQuote();
      }
      // Also reload settings in case they changed
      loadSettings();
    }
  }

  /**
   * Initialize the page
   */
  function initialize() {
    if (isInitialized) return;
    isInitialized = true;

    loadSettings();
    loadQuote();
    setupStorageListener();
    setupOnboarding();
    checkOnboarding();
    checkNotifications();
  }

  // Event listeners
  refreshEl.addEventListener("click", handleRefresh);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  if (copyQuoteEl) copyQuoteEl.addEventListener("click", copyCurrentQuote);
  if (favoriteQuoteEl) favoriteQuoteEl.addEventListener("click", toggleFavorite);

  // ============ Notifications ============

  /**
   * Check for pending notifications
   */
  async function checkNotifications() {
    if (!isExtensionContextValid()) return;

    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_PENDING_NOTIFICATIONS" });
      const notifications = response?.notifications || [];

      if (notifications.length > 0) {
        // Show the first notification
        const notification = notifications[0];
        currentNotification = notification;

        if (notification.type === "update") {
          showUpdateNotificationBanner(notification);
        }
      }
    } catch (error) {
      console.warn("[Musing] Could not check notifications:", error);
    }
  }

  /**
   * Show update notification banner
   */
  function showUpdateNotificationBanner(notification) {
    notificationIconEl.textContent = "🎉";
    notificationTitleEl.textContent = notification.title;
    notificationSubtitleEl.textContent = "Click to see what's new";

    // Show banner with slight delay for smooth animation
    setTimeout(() => {
      notificationBannerEl.classList.add("show");
    }, 500);
  }

  /**
   * Hide notification banner
   */
  function hideNotificationBanner() {
    notificationBannerEl.classList.remove("show");
  }

  /**
   * Show What's New modal for a version
   */
  function showWhatsNewModal(version) {
    const changelog = VERSION_CHANGELOG[version];

    if (changelog) {
      whatsNewIconEl.textContent = changelog.icon;
      whatsNewTitleEl.textContent = changelog.title;
      whatsNewVersionEl.textContent = `Version ${version}`;

      // Render changelog items
      whatsNewListEl.replaceChildren();
      changelog.items.forEach((item) => {
        const itemEl = document.createElement("div");
        itemEl.className = "whats-new-item";

        const iconEl = document.createElement("span");
        iconEl.className = "whats-new-item-icon";
        iconEl.textContent = item.icon;
        itemEl.appendChild(iconEl);

        const textEl = document.createElement("span");
        textEl.className = "whats-new-item-text";
        textEl.textContent = item.text;
        itemEl.appendChild(textEl);

        whatsNewListEl.appendChild(itemEl);
      });
    } else {
      // Generic update message if no specific changelog
      whatsNewIconEl.textContent = "✨";
      whatsNewTitleEl.textContent = "musing has been updated";
      whatsNewVersionEl.textContent = `Version ${version}`;

      whatsNewListEl.replaceChildren();
      const itemEl = document.createElement("div");
      itemEl.className = "whats-new-item";
      const iconEl = document.createElement("span");
      iconEl.className = "whats-new-item-icon";
      iconEl.textContent = "🚀";
      itemEl.appendChild(iconEl);
      const textEl = document.createElement("span");
      textEl.className = "whats-new-item-text";
      textEl.textContent = "Bug fixes and performance improvements";
      itemEl.appendChild(textEl);
      whatsNewListEl.appendChild(itemEl);
    }

    whatsNewEl.classList.add("show");
  }

  /**
   * Hide What's New modal
   */
  function hideWhatsNewModal() {
    whatsNewEl.classList.remove("show");
  }

  /**
   * Dismiss the current notification
   */
  async function dismissCurrentNotification() {
    if (!currentNotification || !isExtensionContextValid()) return;

    try {
      await chrome.runtime.sendMessage({
        type: "DISMISS_NOTIFICATION",
        notificationId: currentNotification.id,
      });
    } catch (error) {
      console.warn("[Musing] Could not dismiss notification:", error);
    }

    currentNotification = null;
    hideNotificationBanner();
  }

  /**
   * Handle notification view click
   */
  function handleNotificationView() {
    if (!currentNotification) return;

    hideNotificationBanner();

    if (currentNotification.type === "update") {
      showWhatsNewModal(currentNotification.currentVersion);
    }
  }

  /**
   * Handle What's New close
   */
  function handleWhatsNewClose() {
    hideWhatsNewModal();
    dismissCurrentNotification();
  }

  // Notification event listeners
  notificationViewBtnEl.addEventListener("click", handleNotificationView);
  notificationDismissBtnEl.addEventListener("click", dismissCurrentNotification);
  whatsNewCloseBtnEl.addEventListener("click", handleWhatsNewClose);

  // Close What's New on escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && whatsNewEl.classList.contains("show")) {
      handleWhatsNewClose();
    }
  });

  // Close What's New on overlay click
  whatsNewEl.addEventListener("click", (e) => {
    if (e.target === whatsNewEl) {
      handleWhatsNewClose();
    }
  });

  // ============ Onboarding ============

  const onboardingEl = document.getElementById("onboarding");
  const onboardingSteps = document.querySelectorAll(".onboarding-step");
  let currentStep = 1;

  /**
   * Show specific onboarding step
   */
  function showStep(step) {
    currentStep = step;
    onboardingSteps.forEach((stepEl) => {
      const stepNum = parseInt(stepEl.dataset.step);
      stepEl.classList.toggle("active", stepNum === step);
    });
  }

  /**
   * Complete onboarding
   */
  async function completeOnboarding() {
    await Store.onboarding.markDone();
    onboardingEl.classList.remove("show");
  }

  /**
   * Check and show onboarding if needed
   */
  async function checkOnboarding() {
    if (!(await Store.onboarding.isDone())) {
      onboardingEl.classList.add("show");
    }
  }

  /**
   * Setup onboarding event listeners
   */
  function setupOnboarding() {
    // Skip button
    const skipBtn = document.getElementById("onboarding-skip");
    if (skipBtn) {
      skipBtn.addEventListener("click", completeOnboarding);
    }

    // Next button step 1
    const next1Btn = document.getElementById("onboarding-next-1");
    if (next1Btn) {
      next1Btn.addEventListener("click", () => showStep(2));
    }

    // Back button step 2
    const back2Btn = document.getElementById("onboarding-back-2");
    if (back2Btn) {
      back2Btn.addEventListener("click", () => showStep(1));
    }

    // Next button step 2
    const next2Btn = document.getElementById("onboarding-next-2");
    if (next2Btn) {
      next2Btn.addEventListener("click", () => showStep(3));
    }

    // Finish button
    const finishBtn = document.getElementById("onboarding-finish");
    if (finishBtn) {
      finishBtn.addEventListener("click", completeOnboarding);
    }

    // Close on escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && onboardingEl.classList.contains("show")) {
        completeOnboarding();
      }
    });
  }

  // Initialize
  initialize();
})();
