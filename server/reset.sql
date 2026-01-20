-- Delete all data from tables (keeps schema intact)
DELETE FROM quotes;

-- Reset autoincrement counter
DELETE FROM sqlite_sequence WHERE name = 'quotes';
