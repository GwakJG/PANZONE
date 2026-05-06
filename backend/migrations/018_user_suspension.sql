-- Account suspension (separate from soft-deletion).
-- A suspended user:
--   - Cannot log in (auth returns 403 with reason)
--   - Still has an active row → their email / nickname are locked from re-registration
--   - Admin can view, tier/counters still tracked, admin can unsuspend
-- Future: send email to suspend_email_sent users when email integration lands.

ALTER TABLE users
  ADD COLUMN suspended_at    DATETIME     NULL AFTER deleted_at,
  ADD COLUMN suspend_reason  VARCHAR(500) NULL AFTER suspended_at,
  ADD KEY idx_users_suspended_at (suspended_at);
