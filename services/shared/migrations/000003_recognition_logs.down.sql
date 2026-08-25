DROP INDEX IF EXISTS idx_recognition_logs_camera_created;
DROP TABLE IF EXISTS recognition_logs;
ALTER TABLE cameras DROP COLUMN IF EXISTS show_bbox;
