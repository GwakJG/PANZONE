CREATE TABLE steam_news_imports (
  gid          VARCHAR(64) NOT NULL,
  post_id      BIGINT UNSIGNED NOT NULL,
  source_url   VARCHAR(500) NULL,
  imported_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (gid),
  UNIQUE KEY uq_steam_news_post (post_id),
  CONSTRAINT fk_steam_news_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
