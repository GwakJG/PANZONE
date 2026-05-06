-- Admin resolution metadata for inquiries — mirrors reports schema.
-- resolve_action captures WHAT was done (unsuspend / reject_appeal / reply /
-- close_unanswered) so the list can render a badge. resolve_note is the
-- user-facing reply; admin_memo is an internal shared jotter.

ALTER TABLE inquiries
  ADD COLUMN resolver_user_id BIGINT UNSIGNED NULL AFTER resolved_at,
  ADD COLUMN resolve_note     VARCHAR(1000) NULL AFTER resolver_user_id,
  ADD COLUMN resolve_action
    ENUM('unsuspend','reject_appeal','reply','close_unanswered')
    NULL AFTER resolve_note,
  ADD COLUMN admin_memo       VARCHAR(1000) NULL AFTER resolve_action,
  ADD CONSTRAINT fk_inquiries_resolver FOREIGN KEY (resolver_user_id)
    REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
