CREATE TABLE user_stats_favorites (
  user_id    BIGINT UNSIGNED NOT NULL,
  player     VARCHAR(100)    NOT NULL,
  platform   VARCHAR(20)     NOT NULL,
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, player, platform),
  KEY idx_user_stats_favorites_user_created (user_id, created_at DESC),
  CONSTRAINT fk_user_stats_favorites_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
