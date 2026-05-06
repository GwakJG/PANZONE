-- User inquiries: suspension appeals first, general contact form later.
-- Similar shape to reports (reason-style text + evidence images).

CREATE TABLE inquiries (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NULL,
  kind        ENUM('suspension_appeal','general') NOT NULL DEFAULT 'general',
  message     VARCHAR(1000) NOT NULL,
  image_urls  JSON NULL,
  status      ENUM('pending','resolved','dismissed') NOT NULL DEFAULT 'pending',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_inquiries_status (status),
  KEY idx_inquiries_user (user_id),
  KEY idx_inquiries_kind_status (kind, status),
  CONSTRAINT fk_inquiries_user FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
