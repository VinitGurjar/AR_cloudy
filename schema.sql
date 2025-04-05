-- Schema for the image-to-3d-model conversion database

CREATE TABLE IF NOT EXISTS conversions (
  id TEXT PRIMARY KEY,
  image_key TEXT NOT NULL,
  model_key TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_conversions_status ON conversions(status);
CREATE INDEX IF NOT EXISTS idx_conversions_created_at ON conversions(created_at);
