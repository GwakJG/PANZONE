-- Track what action the admin took when resolving. Stored alongside the
-- free-form `resolve_note` so the queue can render a badge ("글삭제" / "댓글 삭제" / …)
-- on resolved rows.

ALTER TABLE reports
  ADD COLUMN resolve_action
    ENUM('post_delete','comment_delete','suspend','no_offense')
    NULL AFTER resolve_note;
