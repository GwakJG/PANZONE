-- Shared admin-only memo on reports. Distinct from `resolve_note` (which is
-- user-facing): this is a free-form jotter that any admin can read/edit,
-- used for handover context ("두 번째 재범", "유저 직접 연락함" 등).

ALTER TABLE reports
  ADD COLUMN admin_memo VARCHAR(1000) NULL AFTER resolve_action;
