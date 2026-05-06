UPDATE posts p
SET p.comment_count = (
  SELECT COUNT(*) FROM comments c
  WHERE c.post_id = p.id
);
