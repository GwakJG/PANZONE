CREATE TABLE user_searches (
  user_id    BIGINT UNSIGNED NOT NULL,
  term       VARCHAR(100)    NOT NULL,
  updated_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, term),
  KEY idx_user_searches_user_updated (user_id, updated_at DESC),
  CONSTRAINT fk_user_searches_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
