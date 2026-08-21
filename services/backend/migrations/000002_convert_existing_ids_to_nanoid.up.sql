-- Convert databases created by the previous Ent schemas (integer user/camera/
-- recording IDs, UUID sessions, and a fixed `global` settings ID) to Nano IDs.
-- Run this once, before deploying the application code that uses the new schema.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION cctv_nanoid() RETURNS VARCHAR(21)
LANGUAGE SQL
VOLATILE
AS $$
  SELECT substring(
    translate(encode(gen_random_bytes(18), 'base64'), '+/', '-_')
    FROM 1 FOR 21
  )::VARCHAR(21);
$$;

DO $$
DECLARE
  needs_conversion BOOLEAN;
  old_user_fk TEXT;
  old_camera_fk TEXT;
  constraint_record RECORD;
BEGIN
  SELECT data_type <> 'character varying' INTO needs_conversion
  FROM information_schema.columns
  WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'id';

  -- A fresh database has already been created with VARCHAR(21) Nano IDs.
  IF NOT COALESCE(needs_conversion, FALSE) THEN
    RETURN;
  END IF;

  ALTER TABLE users ADD COLUMN nanoid_id VARCHAR(21);
  ALTER TABLE cameras ADD COLUMN nanoid_id VARCHAR(21);
  ALTER TABLE recordings ADD COLUMN nanoid_id VARCHAR(21);
  ALTER TABLE sessions ADD COLUMN nanoid_id VARCHAR(21);
  ALTER TABLE settings ADD COLUMN nanoid_id VARCHAR(21);
  ALTER TABLE sessions ADD COLUMN nanoid_user_id VARCHAR(21);
  ALTER TABLE recordings ADD COLUMN nanoid_camera_id VARCHAR(21);

  UPDATE users SET nanoid_id = cctv_nanoid();
  UPDATE cameras SET nanoid_id = cctv_nanoid();
  UPDATE recordings SET nanoid_id = cctv_nanoid();
  UPDATE sessions SET nanoid_id = cctv_nanoid();
  UPDATE settings SET nanoid_id = cctv_nanoid();

  -- Previous Ent versions used `user_sessions` / `camera_recordings`; the
  -- original hand-written migration used `user_id` / `camera_id`. Resolve either
  -- old foreign-key name rather than assuming one particular deployment history.
  SELECT a.attname INTO old_user_fk
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
  WHERE c.conrelid = 'sessions'::regclass AND c.contype = 'f'
  LIMIT 1;

  SELECT a.attname INTO old_camera_fk
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
  WHERE c.conrelid = 'recordings'::regclass AND c.contype = 'f'
  LIMIT 1;

  IF old_user_fk IS NULL OR old_camera_fk IS NULL THEN
    RAISE EXCEPTION 'Expected existing sessions and recordings foreign keys';
  END IF;

  EXECUTE format(
    'UPDATE sessions s SET nanoid_user_id = u.nanoid_id FROM users u WHERE s.%I = u.id',
    old_user_fk
  );
  EXECUTE format(
    'UPDATE recordings r SET nanoid_camera_id = c.nanoid_id FROM cameras c WHERE r.%I = c.id',
    old_camera_fk
  );

  FOR constraint_record IN
    SELECT conrelid::regclass AS table_name, conname
    FROM pg_constraint
    WHERE contype = 'f' AND conrelid IN ('sessions'::regclass, 'recordings'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', constraint_record.table_name, constraint_record.conname);
  END LOOP;

  EXECUTE format('ALTER TABLE sessions DROP COLUMN %I', old_user_fk);
  EXECUTE format('ALTER TABLE recordings DROP COLUMN %I', old_camera_fk);

  ALTER TABLE users DROP CONSTRAINT users_pkey;
  ALTER TABLE cameras DROP CONSTRAINT cameras_pkey;
  ALTER TABLE recordings DROP CONSTRAINT recordings_pkey;
  ALTER TABLE sessions DROP CONSTRAINT sessions_pkey;
  ALTER TABLE settings DROP CONSTRAINT settings_pkey;

  ALTER TABLE users DROP COLUMN id;
  ALTER TABLE cameras DROP COLUMN id;
  ALTER TABLE recordings DROP COLUMN id;
  ALTER TABLE sessions DROP COLUMN id;
  ALTER TABLE settings DROP COLUMN id;

  ALTER TABLE users RENAME COLUMN nanoid_id TO id;
  ALTER TABLE cameras RENAME COLUMN nanoid_id TO id;
  ALTER TABLE recordings RENAME COLUMN nanoid_id TO id;
  ALTER TABLE sessions RENAME COLUMN nanoid_id TO id;
  ALTER TABLE settings RENAME COLUMN nanoid_id TO id;
  ALTER TABLE sessions RENAME COLUMN nanoid_user_id TO user_id;
  ALTER TABLE recordings RENAME COLUMN nanoid_camera_id TO camera_id;

  ALTER TABLE users ALTER COLUMN id SET NOT NULL;
  ALTER TABLE cameras ALTER COLUMN id SET NOT NULL;
  ALTER TABLE recordings ALTER COLUMN id SET NOT NULL;
  ALTER TABLE sessions ALTER COLUMN id SET NOT NULL;
  ALTER TABLE settings ALTER COLUMN id SET NOT NULL;
  ALTER TABLE sessions ALTER COLUMN user_id SET NOT NULL;
  ALTER TABLE recordings ALTER COLUMN camera_id SET NOT NULL;

  ALTER TABLE users ADD PRIMARY KEY (id);
  ALTER TABLE cameras ADD PRIMARY KEY (id);
  ALTER TABLE recordings ADD PRIMARY KEY (id);
  ALTER TABLE sessions ADD PRIMARY KEY (id);
  ALTER TABLE settings ADD PRIMARY KEY (id);
  ALTER TABLE sessions ADD CONSTRAINT sessions_users_sessions FOREIGN KEY (user_id) REFERENCES users(id);
  ALTER TABLE recordings ADD CONSTRAINT recordings_cameras_recordings FOREIGN KEY (camera_id) REFERENCES cameras(id);
END $$;

DROP FUNCTION cctv_nanoid();
COMMIT;
