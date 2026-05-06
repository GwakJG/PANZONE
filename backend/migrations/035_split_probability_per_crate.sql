DELETE p FROM posts p
  JOIN pubg_probability_imports pi ON pi.post_id = p.id;

DROP TABLE IF EXISTS pubg_probability_imports;

CREATE TABLE pubg_probability_imports (
  crate_key       VARCHAR(255) NOT NULL,
  post_id         BIGINT UNSIGNED NOT NULL,
  source_url      VARCHAR(500) NOT NULL,
  last_synced_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (crate_key),
  UNIQUE KEY uq_pubg_prob_post (post_id),
  CONSTRAINT fk_pubg_prob_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
