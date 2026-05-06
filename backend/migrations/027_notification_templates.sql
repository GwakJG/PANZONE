-- "자주하는 답변" templates — shared across all admin/mod accounts.
-- creator_id tracks who made each template but anyone with admin/mod role can
-- read/update/delete them (simple collaborative library).
CREATE TABLE notification_templates (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  creator_id BIGINT UNSIGNED NOT NULL,
  title      VARCHAR(200) NOT NULL,
  body       VARCHAR(1000) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_templates_updated (updated_at DESC),
  CONSTRAINT fk_template_creator FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
