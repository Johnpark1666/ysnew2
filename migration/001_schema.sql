-- ============================================================
-- ysnew2 Supabase Migration Schema
-- ============================================================

-- 1. videos 테이블 (YouTube 영상 요약)
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,                    -- YouTube video ID
  title TEXT NOT NULL DEFAULT '',
  channel_name TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL DEFAULT '',
  publish_date TEXT DEFAULT '',
  duration TEXT DEFAULT '',
  processed_at TEXT DEFAULT '',
  read BOOLEAN DEFAULT FALSE,
  favorite BOOLEAN DEFAULT FALSE,
  summary TEXT DEFAULT '',
  insights TEXT DEFAULT '',
  implications TEXT DEFAULT '',
  keywords TEXT DEFAULT '',
  analysis TEXT DEFAULT '',
  transcript TEXT DEFAULT '',
  show_transcript BOOLEAN DEFAULT FALSE,
  image_url TEXT DEFAULT '',
  plus_key TEXT DEFAULT '',
  category TEXT DEFAULT '',
  model TEXT DEFAULT '',
  timeline TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_videos_read ON videos(read);
CREATE INDEX IF NOT EXISTS idx_videos_favorite ON videos(favorite);
CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category);
CREATE INDEX IF NOT EXISTS idx_videos_publish_date ON videos(publish_date);

-- 2. github_repos 테이블 (GitHub Trending 저장소)
CREATE TABLE IF NOT EXISTS github_repos (
  id TEXT PRIMARY KEY,                    -- owner/repo (full name)
  title TEXT NOT NULL DEFAULT '',
  channel_name TEXT NOT NULL DEFAULT '',  -- owner
  video_url TEXT NOT NULL DEFAULT '',
  publish_date TEXT DEFAULT '',
  duration TEXT DEFAULT '',               -- stars count
  processed_at TEXT DEFAULT '',
  read BOOLEAN DEFAULT FALSE,
  favorite BOOLEAN DEFAULT FALSE,
  summary TEXT DEFAULT '',
  insights TEXT DEFAULT '',
  implications TEXT DEFAULT '',
  keywords TEXT DEFAULT '',
  analysis TEXT DEFAULT '',
  transcript TEXT DEFAULT '',
  show_transcript BOOLEAN DEFAULT FALSE,
  image_url TEXT DEFAULT '',
  plus_key TEXT DEFAULT '',
  category TEXT DEFAULT '',               -- language
  model TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_github_repos_read ON github_repos(read);
CREATE INDEX IF NOT EXISTS idx_github_repos_favorite ON github_repos(favorite);

-- 3. notebooklm_mixes 테이블 (AI Mix 결과물)
CREATE TABLE IF NOT EXISTS notebooklm_mixes (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  type TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',           -- Google Drive URL (그대로 유지)
  source_ids TEXT DEFAULT '',
  title TEXT DEFAULT ''
);

-- 4. 시퀀스 업데이트
SELECT setval('notebooklm_mixes_id_seq', COALESCE((SELECT MAX(id) FROM notebooklm_mixes), 0) + 1, FALSE);
