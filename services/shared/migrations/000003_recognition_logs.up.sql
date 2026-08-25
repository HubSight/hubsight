ALTER TABLE cameras
    ADD COLUMN IF NOT EXISTS show_bbox BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS recognition_logs (
    id VARCHAR(21) PRIMARY KEY,
    camera_id VARCHAR(21) NOT NULL,
    type VARCHAR(64) NOT NULL,
    category VARCHAR(32) NOT NULL DEFAULT 'member',
    member_id VARCHAR(21) NOT NULL DEFAULT '',
    track_id INTEGER NOT NULL DEFAULT 0,
    message_key TEXT NOT NULL,
    message_params JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recognition_logs_camera_created
    ON recognition_logs (camera_id, created_at DESC);
