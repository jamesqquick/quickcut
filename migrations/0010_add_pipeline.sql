-- Add pipeline phase tracking to videos
ALTER TABLE videos ADD COLUMN phase TEXT NOT NULL DEFAULT 'review';

-- Add target publish date to videos
ALTER TABLE videos ADD COLUMN target_date TEXT;

-- Add pipeline mode toggle to spaces
ALTER TABLE spaces ADD COLUMN pipeline_enabled INTEGER NOT NULL DEFAULT 0;

-- Add comment phase scoping (script vs review)
ALTER TABLE comments ADD COLUMN comment_phase TEXT NOT NULL DEFAULT 'review';

-- Add text range for script-phase comments (JSON: {from, to, quote})
ALTER TABLE comments ADD COLUMN text_range TEXT;
