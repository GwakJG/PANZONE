-- In-app notifications sent from admin → user. Replaces/augments the email
-- channel for things like: "your post was deleted", "your account was suspended",
-- "your inquiry was answered", "your report was resolved", plus free-form
-- messages an admin can send directly to a user.
CREATE TABLE notifications (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    BIGINT UNSIGNED NOT NULL,
  kind       ENUM(
    'admin_message',
    'post_deleted',
    'suspended',
    'unsuspended',
    'inquiry_resolved',
    'report_resolved',
    'system'
  ) NOT NULL DEFAULT 'admin_message',
  title      VARCHAR(200) NOT NULL,
  body       VARCHAR(1000) NULL,
  link_url   VARCHAR(500) NULL,
  read_at    DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notif_user (user_id, created_at DESC),
  KEY idx_notif_unread (user_id, read_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
