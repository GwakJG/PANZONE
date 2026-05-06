-- Admin resolution metadata for reports: who resolved, optional memo.
-- `status` / `resolved_at` already exist in 001_init; we just add the audit trail.

ALTER TABLE reports
  ADD COLUMN resolver_user_id BIGINT UNSIGNED NULL AFTER resolved_at,
  ADD COLUMN resolve_note     VARCHAR(500) NULL AFTER resolver_user_id,
  ADD CONSTRAINT fk_reports_resolver FOREIGN KEY (resolver_user_id)
    REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
