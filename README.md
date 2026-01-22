# Musing

A Chrome extension that turns your New Tab into personalized historical wisdom, learned locally from your browsing context.

## How It Works

1. **Content scripts** run on Claude.ai, ChatGPT, and Gemini, extracting lightweight context (sanitized snippets + titles)
2. **Background worker** extracts themes and matches quotes from a bundled local quotes database
3. **New tab page** displays a cached quote instantly (no network wait)
4. **Optional BYOK “Smart Reasons”** can call an AI provider using your own API key to explain why a quote was shown

## Architecture

```
Extension (client)
├── content-scripts/     Scrape claude.ai, chatgpt.com, gemini.google.com
├── background.js        Service worker, local theme extraction + caching
├── lib/                 Theme extractor, quotes DB, optional BYOK “Smart Reasons”
├── newtab/              Display cached quotes + search
└── storage              chrome.storage.local for settings + cache
```

## Setup

### Load the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `extension` folder

### Add Icons

Create or add icon files to `extension/icons/`:
- `icon16.png` (16x16)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

## Privacy

- Local by default: theme extraction + quote matching run in your browser
- Optional BYOK: “Smart Reasons” can send small snippets to your selected AI provider using your own API key
- No analytics or tracking code in the extension

## Optional Features

### Smart Reasons (BYOK)

Enable “Smart Reasons” in the popup and add your provider key (Groq / Claude / OpenAI). The extension will generate a short explanation of why a quote was shown.

### Browser History Themes (Optional Permission)

If enabled, the extension can extract themes from your browser history locally. This requires granting the optional `history` permission.

## Customizing Quotes

Edit [quotes.json](file:///Users/personal/dev/musing/extension/data/quotes.json) to add your own quotes.

## Configuration

### Sync Frequency

There is no server sync in the local-by-default mode. Quotes are bundled with the extension and cached locally.

### Cache Size

Edit `extension/background.js`:
```js
const DEFAULT_CACHE_SIZE = 15; // Quotes selected per refresh
```

## License

MIT
