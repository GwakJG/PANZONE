-- Move any remaining posts from 'review' to 'free' so the FK doesn't block deletion.
-- Local DB has zero posts here, so this is a no-op locally; matters only when prod
-- runs the migration after some posts may have been written.
UPDATE posts p
JOIN boards b_review ON b_review.id = p.board_id AND b_review.slug = 'review'
JOIN boards b_free ON b_free.slug = 'free'
SET p.board_id = b_free.id;

UPDATE admin_notice_drafts
SET board_slugs = JSON_REMOVE(
  board_slugs,
  JSON_UNQUOTE(JSON_SEARCH(board_slugs, 'one', 'review'))
)
WHERE JSON_CONTAINS(board_slugs, '"review"');

DELETE FROM boards WHERE slug = 'review';
