-- Marks a post as an admin-authored notice. Set only when an admin/mod creates
-- a post with is_pinned=1. Never cleared — it's the durable "this was an admin
-- notice" flag that lets us distinguish:
--   - admin_notice_at IS NOT NULL AND is_pinned = 1  → 진행중 (visible to users)
--   - admin_notice_at IS NOT NULL AND is_pinned = 0  → 공지 해제 (hidden from users, kept for admin records)
--   - admin_notice_at IS NULL                        → 일반 유저 글 (or user post pinned by admin)
ALTER TABLE posts
  ADD COLUMN admin_notice_at DATETIME NULL AFTER admin_favorite,
  ADD KEY idx_posts_admin_notice (admin_notice_at, is_pinned);
