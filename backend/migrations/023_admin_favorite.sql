-- Admin-only "즐겨찾기" flag on posts. Not shown on public pages; only surfaces
-- in the admin carousel/notice tabs so admins can bookmark posts across boards.
ALTER TABLE posts
  ADD COLUMN admin_favorite TINYINT(1) NOT NULL DEFAULT 0 AFTER is_pinned,
  ADD KEY idx_posts_admin_favorite (admin_favorite);
