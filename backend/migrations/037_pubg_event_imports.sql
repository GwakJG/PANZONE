CREATE TABLE pubg_event_imports (
  pubg_post_id    BIGINT UNSIGNED NOT NULL,
  post_id         BIGINT UNSIGNED NOT NULL,
  source_url      VARCHAR(500) NOT NULL,
  last_synced_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (pubg_post_id),
  UNIQUE KEY uq_pubg_event_post (post_id),
  CONSTRAINT fk_pubg_event_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
