-- Per-user counters for tier calculation.
-- post_count / comment_count kept in sync by posts/comments CRUD routes.
-- visit_count incremented at most once per day per user via authMiddleware.

ALTER TABLE users
  ADD COLUMN post_count      INT UNSIGNED NOT NULL DEFAULT 0 AFTER bio,
  ADD COLUMN comment_count   INT UNSIGNED NOT NULL DEFAULT 0 AFTER post_count,
  ADD COLUMN visit_count     INT UNSIGNED NOT NULL DEFAULT 0 AFTER comment_count,
  ADD COLUMN last_visit_date DATE         NULL              AFTER visit_count;

-- Backfill post_count from existing posts (excludes soft-deleted).
UPDATE users u
SET post_count = (
  SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id AND p.deleted_at IS NULL
);

-- Backfill comment_count from existing comments (excludes soft-deleted).
UPDATE users u
SET comment_count = (
  SELECT COUNT(*) FROM comments c WHERE c.user_id = u.id AND c.deleted_at IS NULL
);

-- visit_count starts at 0 - historical visits can't be reconstructed.
