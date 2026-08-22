CREATE TABLE users (
    id VARCHAR(21) PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    full_name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'viewer',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    locale VARCHAR(5) NOT NULL DEFAULT 'vi',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

CREATE TABLE settings (
    id VARCHAR(21) PRIMARY KEY,
    nvr_status BOOLEAN NOT NULL DEFAULT TRUE,
    storage_quota_gb INTEGER NOT NULL DEFAULT 50,
    retention_days INTEGER NOT NULL DEFAULT 4
);

CREATE TABLE sessions (
    id VARCHAR(21) PRIMARY KEY,
    user_id VARCHAR(21) NOT NULL REFERENCES users(id),
    token_hash BYTEA NOT NULL UNIQUE,
    refresh_token_hash BYTEA,
    is_pwa BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ
);

CREATE TABLE cameras (
    id VARCHAR(21) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    host VARCHAR(255) NOT NULL,
    brand VARCHAR(100) NOT NULL DEFAULT 'generic',
    rtsp_port INTEGER NOT NULL DEFAULT 554,
    rtsp_transport VARCHAR(20) NOT NULL DEFAULT 'auto',
    segment_duration INTEGER NOT NULL DEFAULT 1800,
    video_codec VARCHAR(50) NOT NULL DEFAULT 'copy',
    audio_mode VARCHAR(50) NOT NULL DEFAULT 'auto',
    extra_args TEXT NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    enable_ai BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE recordings (
    id VARCHAR(21) PRIMARY KEY,
    camera_id VARCHAR(21) NOT NULL REFERENCES cameras(id),
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    duration_seconds INTEGER NOT NULL,
    file_path TEXT NOT NULL UNIQUE,
    size_bytes BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recordings_camera_time ON recordings(camera_id, start_at, end_at);
