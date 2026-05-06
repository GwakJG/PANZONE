-- Drafts are separate from `posts` so they don't pollute board listings,
-- counts, or the user-facing feed. A draft carries the full title/body plus
-- the selected board slugs; publishing turns one draft into N posts via the
-- broadcast endpoint and the draft row is then deleted.
CREATE TABLE admin_notice_drafts (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  title       VARCHAR(200) NOT NULL DEFAULT '',
  body        MEDIUMTEXT   NOT NULL,
  board_slugs JSON         NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_drafts_user (user_id, updated_at DESC),
  CONSTRAINT fk_drafts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
