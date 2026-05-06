-- Re-sync users.comment_count with the tier rule:
--   Count all non-deleted comments EXCEPT top-level comments on own post
--   (anti-farming: commenting on your own post shouldn't count toward tier).
-- Idempotent - safe to run on DBs where 014 already ran with the old rule.

UPDATE users u
SET comment_count = (
  SELECT COUNT(*)
  FROM comments c
  JOIN posts p ON p.id = c.post_id
  WHERE c.user_id = u.id
    AND c.deleted_at IS NULL
    AND NOT (p.user_id = u.id AND c.parent_id IS NULL)
);
