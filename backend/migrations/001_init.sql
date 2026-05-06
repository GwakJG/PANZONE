-- Users
CREATE TABLE users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email         VARCHAR(255)    NOT NULL,
  password_hash VARCHAR(255)    NOT NULL,
  name          VARCHAR(64)     NOT NULL,
  avatar_url    VARCHAR(500)    NULL,
  bio           VARCHAR(500)    NULL,
  role          ENUM('user','mod','admin') NOT NULL DEFAULT 'user',
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME        NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verification codes (for signup email verification)
CREATE TABLE verification_codes (
  email      VARCHAR(255) NOT NULL,
  code       VARCHAR(16)  NOT NULL,
  expires_at DATETIME     NOT NULL,
  verified   TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Boards (categories)
CREATE TABLE boards (
  id          SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug        VARCHAR(32)  NOT NULL,
  name_ko     VARCHAR(64)  NOT NULL,
  name_en     VARCHAR(64)  NOT NULL,
  group_order TINYINT UNSIGNED NOT NULL,
  sort_order  TINYINT UNSIGNED NOT NULL,
  board_type  ENUM('announcement','user','data') NOT NULL DEFAULT 'user',
  is_writable TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_boards_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Posts
CREATE TABLE posts (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  board_id      SMALLINT UNSIGNED NOT NULL,
  user_id       BIGINT UNSIGNED NOT NULL,
  title         VARCHAR(200)    NOT NULL,
  body          MEDIUMTEXT      NOT NULL,
  is_pinned     TINYINT(1)      NOT NULL DEFAULT 0,
  view_count    INT UNSIGNED    NOT NULL DEFAULT 0,
  like_count    INT UNSIGNED    NOT NULL DEFAULT 0,
  comment_count INT UNSIGNED    NOT NULL DEFAULT 0,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME        NULL,
  PRIMARY KEY (id),
  KEY idx_posts_board_pinned_created (board_id, is_pinned DESC, created_at DESC),
  KEY idx_posts_user (user_id),
  KEY idx_posts_deleted_at (deleted_at),
  CONSTRAINT fk_posts_board FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_posts_user  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE  ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Post images (multiple per post, ordered)
CREATE TABLE post_images (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id    BIGINT UNSIGNED NOT NULL,
  url        VARCHAR(500)    NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_post_images_post (post_id, sort_order),
  CONSTRAINT fk_post_images_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Comments (with 1-level reply)
CREATE TABLE comments (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id    BIGINT UNSIGNED NOT NULL,
  user_id    BIGINT UNSIGNED NOT NULL,
  parent_id  BIGINT UNSIGNED NULL,
  body       TEXT         NOT NULL,
  image_url  VARCHAR(500) NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_comments_post_created (post_id, created_at DESC),
  KEY idx_comments_user (user_id),
  KEY idx_comments_parent (parent_id),
  CONSTRAINT fk_comments_post   FOREIGN KEY (post_id)   REFERENCES posts(id)    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_comments_user   FOREIGN KEY (user_id)   REFERENCES users(id)    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_comments_parent FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Likes (composite PK prevents duplicates)
CREATE TABLE likes (
  post_id    BIGINT UNSIGNED NOT NULL,
  user_id    BIGINT UNSIGNED NOT NULL,
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id),
  KEY idx_likes_user (user_id),
  CONSTRAINT fk_likes_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_likes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reports (polymorphic target)
CREATE TABLE reports (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reporter_user_id BIGINT UNSIGNED NOT NULL,
  target_type      ENUM('post','comment') NOT NULL,
  target_id        BIGINT UNSIGNED NOT NULL,
  reason           VARCHAR(500) NOT NULL,
  status           ENUM('pending','resolved','dismissed') NOT NULL DEFAULT 'pending',
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at      DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_reports_target (target_type, target_id),
  KEY idx_reports_status (status),
  KEY idx_reports_reporter (reporter_user_id),
  CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
