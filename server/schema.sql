-- Quotes table
CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  author TEXT NOT NULL,
  themes TEXT NOT NULL DEFAULT '[]', -- JSON array of theme strings
  source TEXT, -- Optional: where the quote came from
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for theme searching
CREATE INDEX IF NOT EXISTS idx_quotes_themes ON quotes(themes);

-- Full-text search (optional, for better matching)
-- CREATE VIRTUAL TABLE IF NOT EXISTS quotes_fts USING fts5(text, author, themes);
