## Goals
1. Ship the full set of UX improvements + new features discussed for the new tab + popup.
2. Align product messaging to “local-by-default” with optional BYOK advanced intelligence.
3. Reduce surprise/overhead (proactive background tabs, heavy DOM observers) without breaking existing behavior.

## Product / Messaging Alignment
1. Update copy everywhere to: “local-by-default; optional BYOK for Smart Reasons / advanced intelligence”.
2. Update README to reflect current architecture (no required server; optional BYOK; optional History permission).
3. Update landing page copy (hero + privacy + features) to explicitly mention BYOK optional AI.
4. Resolve version/What’s New mismatch by bumping extension version and updating changelog entries.

## New Tab UX Improvements (Quick Wins)
1. Fix refresh button placement (explicit left/right positioning) and ensure it doesn’t conflict with other fixed elements.
2. Make search bar responsive (fluid widths, better behavior on small viewports).
3. Restore keyboard accessibility (focus rings for engine selector, refresh, and other controls; add aria-labels).

## New Tab Features
1. Quote actions row:
   - Copy quote to clipboard (toast confirmation).
   - Favorite/unfavorite (persisted locally).
2. Quote history:
   - Store a “shown quotes” history with timestamps.
   - Add a modal to browse history and re-open a prior quote.
3. Daily mode:
   - Setting: “Daily quote” (stable quote per day).
   - Refresh behavior: either “new quote for today” or “next quote” while keeping day lock.
4. Theme chips + “less like this”:
   - Display matched themes as chips.
   - Allow blocking a theme (local setting) and adjust quote selection + cache refresh to avoid blocked themes.
5. Better empty state:
   - If no themes/conversations yet: show a calm onboarding hint and a shortcut to open extension settings.

## Popup UX + Controls
1. Add a “Personalization” section:
   - Toggle Daily quote.
   - Toggle “Show theme chips / reasons”.
   - Manage blocked themes (list + remove).
2. Add a “Favorites” section:
   - Show favorites count.
   - View/export favorites (modal).
3. Add “Proactive background refresh” toggle:
   - Default: keep existing installs’ behavior; for new installs default to OFF (or ON—implemented as a config, easy to switch).
   - Clear explanation copy (what it does, privacy implications).

## Background Logic Changes
1. Add storage keys for:
   - favorites, shownQuotesHistory, dailyMode state, blockedThemes, proactiveScrapeEnabled.
2. Update quote selection pipeline:
   - Filter/penalize quotes containing blocked themes.
   - Persist shown quote objects to history list.
   - Daily-mode selection + “today lock”.
3. Gate proactive scraping:
   - Before creating background tabs, check proactiveScrapeEnabled and platform toggles.

## Performance Improvements (Content Scripts)
1. Narrow MutationObserver target:
   - Detect the best conversation container once, observe that instead of full body.
2. Backoff when idle:
   - When no meaningful changes for X seconds, reduce scrape frequency until activity resumes.
3. Keep existing sanitization/PII filtering intact.

## Files Likely To Change
- Extension UI: [newtab/newtab.html](file:///Users/personal/dev/musing/extension/newtab/newtab.html), [newtab/newtab.js](file:///Users/personal/dev/musing/extension/newtab/newtab.js)
- Popup UI: [popup/popup.html](file:///Users/personal/dev/musing/extension/popup/popup.html), [popup/popup.js](file:///Users/personal/dev/musing/extension/popup/popup.js)
- Background logic: [background.js](file:///Users/personal/dev/musing/extension/background.js)
- Content scripts (perf): [content-scripts/chatgpt.js](file:///Users/personal/dev/musing/extension/content-scripts/chatgpt.js) and analogs for claude/gemini
- Messaging/docs: [README.md](file:///Users/personal/dev/musing/README.md), [landing/index.html](file:///Users/personal/dev/musing/landing/index.html)
- Versioning: [manifest.json](file:///Users/personal/dev/musing/extension/manifest.json)

## Verification
1. Static validation:
   - Confirm manifest JSON parses and MV3 keys remain valid.
   - Confirm newtab/popup scripts load without runtime syntax errors (basic node parse check where applicable).
2. Behavioral smoke checks:
   - New tab: quote load, refresh, search dropdown keyboard nav, copy/favorite, history modal, daily mode.
   - Popup: toggles persist, favorites list renders, blocked themes management works.
   - Background: proactive scrape respects the toggle; quote selection respects blocked themes.

## Defaults / UX Decisions (Chosen)
1. “Fully local” language becomes “local-by-default + BYOK advanced intelligence”.
2. Proactive background scraping: keep existing users’ current behavior; new installs default to off to avoid surprise.
3. “Less like this” blocks a theme (hard block) to make the effect obvious.

If you confirm, I’ll start implementing in this order: new tab UX quick wins → new tab features → popup controls → background logic → perf improvements → docs/versioning → verification.