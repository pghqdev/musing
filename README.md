# Musing

A Chrome extension that displays historical quotes relevant to your AI conversations on every new tab.

## How It Works

1. **Content scripts** run on Claude.ai and ChatGPT, extracting recent conversation text
2. **Background worker** periodically syncs with the server (every 24 hours)
3. **Server** (Cloudflare Worker) uses Groq to extract themes and matches quotes from a curated database
4. **New tab page** displays a cached quote instantly (no network wait)

## Architecture

```
Extension (client)
├── content-scripts/     Scrape claude.ai, chatgpt.com
├── background.js        Service worker, sync + cache logic
├── newtab/              Display cached quotes
└── storage              chrome.storage.local for quote cache

Server (Cloudflare Worker)
├── Groq API             Extract themes from conversation
└── D1 Database          Store and query quotes
```

## Setup

### 1. Deploy the Server

```bash
cd server

# Install dependencies
npm install

# Create D1 database
npm run db:create
# Copy the database_id to wrangler.toml

# Initialize schema
npm run db:init

# Seed with quotes
npm run db:seed

# Add Groq API key
wrangler secret put GROQ_API_KEY

# Deploy
npm run deploy
```

After deployment, note your Worker URL (e.g., `https://musing-api.your-subdomain.workers.dev`).

### 2. Configure the Extension

Edit `extension/background.js` and update `API_URL` with your Worker URL:

```js
const API_URL = "https://musing-api.your-subdomain.workers.dev";
```

### 3. Load the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `extension` folder

### 4. Add Icons

Create or add icon files to `extension/icons/`:
- `icon16.png` (16x16)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

## Privacy

- Conversation text is sent to your Cloudflare Worker for theme extraction
- Groq processes the text but does not retain it (see Groq's privacy policy)
- No conversation data is stored on the server; only themes are extracted
- All quote caching happens locally in your browser

For maximum privacy, you can self-host the Cloudflare Worker.

## Development

### Local Server Development

```bash
cd server

# Run locally
npm run dev

# Test with local D1
npm run db:init:local
npm run db:seed:local
```

### Testing the API

```bash
curl -X POST http://localhost:8787/quotes \
  -H "Content-Type: application/json" \
  -d '{"conversation": "I am debugging a race condition in my async code", "count": 5}'
```

## Customizing Quotes

Edit `server/seed.sql` to add your own quotes. Each quote should have:
- `text`: The quote itself
- `author`: Attribution
- `themes`: JSON array of lowercase theme tags

Example:
```sql
INSERT INTO quotes (text, author, themes) VALUES
('Your quote here.', 'Author Name', '["theme1", "theme2", "theme3"]');
```

After editing, re-run the seed:
```bash
npm run db:seed
```

## Configuration

### Sync Frequency

Edit `extension/background.js`:
```js
const SYNC_INTERVAL_HOURS = 24; // Change to 72 for 3-day sync
```

### Cache Size

Edit `extension/background.js`:
```js
const DEFAULT_CACHE_SIZE = 15; // Quotes fetched per sync
```

## License

MIT
