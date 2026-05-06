-- Unified reactions table (like / dislike, mutually exclusive per user per post).

CREATE TABLE reactions (
  post_id    BIGINT UNSIGNED NOT NULL,
  user_id    BIGINT UNSIGNED NOT NULL,
  type       ENUM('like','dislike') NOT NULL,
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id),
  KEY idx_reactions_user (user_id),
  KEY idx_reactions_post_type (post_id, type),
  CONSTRAINT fk_reactions_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_reactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Carry over existing likes
INSERT INTO reactions (post_id, user_id, type, created_at)
SELECT post_id, user_id, 'like', created_at FROM likes;

-- Add dislike_count column (existing rows start at 0)
ALTER TABLE posts ADD COLUMN dislike_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER like_count;

-- Drop the old single-purpose table
DROP TABLE likes;
