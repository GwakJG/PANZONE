-- Moderation deletion reason. Stored so when email integration lands we can
-- retroactively notify authors why their post was removed.
-- Self-deletion (owner) leaves this NULL.

ALTER TABLE posts
  ADD COLUMN deleted_reason VARCHAR(500) NULL AFTER deleted_at;
