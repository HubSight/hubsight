--
-- PostgreSQL database dump
--

\restrict 9MY2zhhgJ7dbwfI7EheCcxKHHTDMoAx0g8n1mjuFDG4c3CCpSPyT44hNffRBUeX

-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.11 (Debian 17.11-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: cameras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cameras (
    name character varying(255) NOT NULL,
    host text NOT NULL,
    rtsp_port bigint DEFAULT 554 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    brand character varying(64) DEFAULT 'generic'::character varying NOT NULL,
    rtsp_transport character varying(32) DEFAULT 'auto'::character varying NOT NULL,
    segment_duration bigint DEFAULT 1800 NOT NULL,
    video_codec character varying(32) DEFAULT 'copy'::character varying NOT NULL,
    audio_mode character varying(32) DEFAULT 'auto'::character varying NOT NULL,
    extra_args text DEFAULT ''::character varying NOT NULL,
    enable_ai boolean DEFAULT false NOT NULL,
    id character varying NOT NULL,
    show_bbox boolean DEFAULT true NOT NULL,
    is_stopped boolean DEFAULT false NOT NULL
);


--
-- Name: member_faces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_faces (
    id character varying NOT NULL,
    embedding jsonb NOT NULL,
    sample_image_url text DEFAULT ''::character varying NOT NULL,
    quality_score numeric DEFAULT 0 NOT NULL,
    yaw numeric DEFAULT 0 NOT NULL,
    pitch numeric DEFAULT 0 NOT NULL,
    blur_score numeric DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    member_id character varying(21) NOT NULL
);


--
-- Name: members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.members (
    id character varying NOT NULL,
    name character varying(255) NOT NULL,
    role character varying(32) DEFAULT 'family'::character varying NOT NULL,
    avatar_url text DEFAULT ''::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id character varying NOT NULL,
    camera_id character varying(21) DEFAULT ''::character varying NOT NULL,
    type character varying(64) DEFAULT 'person_identified'::character varying NOT NULL,
    title character varying(255) NOT NULL,
    body text DEFAULT ''::character varying NOT NULL,
    category character varying(64) DEFAULT 'family'::character varying NOT NULL,
    member_id character varying(21) DEFAULT ''::character varying NOT NULL,
    thumbnail_url text DEFAULT ''::character varying NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id character varying NOT NULL,
    user_id character varying(21) DEFAULT ''::character varying NOT NULL,
    endpoint text NOT NULL,
    p256dh character varying(255) NOT NULL,
    auth character varying(255) NOT NULL,
    user_agent text DEFAULT ''::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: recognition_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recognition_logs (
    id character varying NOT NULL,
    camera_id character varying(21) NOT NULL,
    type character varying(64) NOT NULL,
    category character varying(64) DEFAULT 'member'::character varying NOT NULL,
    member_id character varying(21) DEFAULT ''::character varying NOT NULL,
    track_id bigint DEFAULT 0,
    message_key character varying(128) NOT NULL,
    message_params jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: recordings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recordings (
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    duration_seconds bigint NOT NULL,
    file_path text NOT NULL,
    size_bytes bigint NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id character varying NOT NULL,
    camera_id character varying(21) NOT NULL,
    thumbnail_path text
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    token_hash bytea NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_seen_at timestamp with time zone,
    refresh_token_hash bytea,
    is_pwa boolean DEFAULT false NOT NULL,
    id character varying NOT NULL,
    user_id character varying(21) NOT NULL
);


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    nvr_status boolean DEFAULT true NOT NULL,
    storage_quota_gb bigint DEFAULT 50 NOT NULL,
    retention_days bigint DEFAULT 4 NOT NULL,
    id character varying NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    username character varying(255) NOT NULL,
    password_hash text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_login_at timestamp with time zone,
    role character varying(32) DEFAULT 'viewer'::character varying NOT NULL,
    full_name character varying(255) DEFAULT ''::character varying NOT NULL,
    locale character varying(16) DEFAULT 'vi'::character varying NOT NULL,
    id character varying NOT NULL,
    timezone character varying(64) DEFAULT 'Asia/Ho_Chi_Minh'::character varying NOT NULL,
    push_preferences jsonb
);


--
-- Name: cameras cameras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cameras
    ADD CONSTRAINT cameras_pkey PRIMARY KEY (id);


--
-- Name: member_faces member_faces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_faces
    ADD CONSTRAINT member_faces_pkey PRIMARY KEY (id);


--
-- Name: members members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: recognition_logs recognition_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recognition_logs
    ADD CONSTRAINT recognition_logs_pkey PRIMARY KEY (id);


--
-- Name: recordings recordings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recordings
    ADD CONSTRAINT recordings_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_member_faces_member_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_faces_member_id ON public.member_faces USING btree (member_id);


--
-- Name: idx_push_subscriptions_endpoint; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_push_subscriptions_endpoint ON public.push_subscriptions USING btree (endpoint);


--
-- Name: idx_push_subscriptions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions USING btree (user_id);


--
-- Name: idx_recognition_logs_camera_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recognition_logs_camera_created ON public.recognition_logs USING btree (camera_id, created_at);


--
-- Name: idx_recordings_camera_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recordings_camera_id ON public.recordings USING btree (camera_id);


--
-- Name: idx_recordings_file_path; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_recordings_file_path ON public.recordings USING btree (file_path);


--
-- Name: idx_sessions_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_sessions_token_hash ON public.sessions USING btree (token_hash);


--
-- Name: idx_sessions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_user_id ON public.sessions USING btree (user_id);


--
-- Name: idx_users_username; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_users_username ON public.users USING btree (username);


--
-- Name: push_subscriptions_endpoint_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX push_subscriptions_endpoint_key ON public.push_subscriptions USING btree (endpoint);


--
-- Name: recognitionlog_camera_id_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recognitionlog_camera_id_created_at ON public.recognition_logs USING btree (camera_id, created_at);


--
-- Name: recordings_file_path_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX recordings_file_path_key ON public.recordings USING btree (file_path);


--
-- Name: sessions_token_hash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sessions_token_hash_key ON public.sessions USING btree (token_hash);


--
-- Name: users_username_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_username_key ON public.users USING btree (username);


--
-- Name: recordings fk_cameras_recordings; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recordings
    ADD CONSTRAINT fk_cameras_recordings FOREIGN KEY (camera_id) REFERENCES public.cameras(id);


--
-- Name: member_faces fk_members_faces; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_faces
    ADD CONSTRAINT fk_members_faces FOREIGN KEY (member_id) REFERENCES public.members(id);


--
-- Name: push_subscriptions fk_users_push_subscriptions; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT fk_users_push_subscriptions FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: sessions fk_users_sessions; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT fk_users_sessions FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: member_faces member_faces_members_faces; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_faces
    ADD CONSTRAINT member_faces_members_faces FOREIGN KEY (member_id) REFERENCES public.members(id);


--
-- Name: push_subscriptions push_subscriptions_users_push_subscriptions; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_users_push_subscriptions FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: recordings recordings_cameras_recordings; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recordings
    ADD CONSTRAINT recordings_cameras_recordings FOREIGN KEY (camera_id) REFERENCES public.cameras(id);


--
-- Name: sessions sessions_users_sessions; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_users_sessions FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict 9MY2zhhgJ7dbwfI7EheCcxKHHTDMoAx0g8n1mjuFDG4c3CCpSPyT44hNffRBUeX

