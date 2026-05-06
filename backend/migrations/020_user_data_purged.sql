-- Timestamp of when a suspended user's content was purged.
-- Null = not yet purged (still within 30-day retention window or not suspended).
-- Non-null = purge already ran; unsuspend is permanently blocked, user row stays
-- to keep email / nickname locked from re-registration.

ALTER TABLE users
  ADD COLUMN data_purged_at DATETIME NULL AFTER suspend_reason,
  ADD KEY idx_users_data_purged_at (data_purged_at);
