-- Extend featured_posts to support banner-only slots (no post_id).
-- Carousel now has two kinds of slots:
--   type='post'   → references posts.id (existing behavior)
--   type='banner' → standalone image + link_url + title (no post)

ALTER TABLE featured_posts
  MODIFY COLUMN post_id BIGINT UNSIGNED NULL,
  ADD COLUMN type ENUM('post','banner') NOT NULL DEFAULT 'post' AFTER id,
  ADD COLUMN banner_image_url VARCHAR(500) NULL AFTER active,
  ADD COLUMN banner_link_url  VARCHAR(500) NULL AFTER banner_image_url,
  ADD COLUMN banner_title     VARCHAR(200) NULL AFTER banner_link_url;
