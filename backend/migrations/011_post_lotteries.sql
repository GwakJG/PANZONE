CREATE TABLE post_lotteries (
  post_id        BIGINT UNSIGNED NOT NULL,
  prize          VARCHAR(200)    NOT NULL,
  winners_count  SMALLINT UNSIGNED NOT NULL,
  draw_at        DATETIME        NOT NULL,
  drawn_at       DATETIME        NULL,
  winner_ids     JSON            NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id),
  KEY idx_post_lotteries_draw (drawn_at, draw_at),
  CONSTRAINT fk_post_lotteries_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
