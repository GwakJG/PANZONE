-- Sticky tier: once a user hits a tier, they never lose it (even if they delete posts/comments).
-- Admin/mod (tier 4) stays dynamic via role; this column only stores tier 0-3.

ALTER TABLE users
  ADD COLUMN achieved_tier TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER visit_count;

-- Backfill: set each user's achieved_tier to their currently-qualified tier (from counters).
-- Mirrors backend/lib/tier.js THRESHOLDS exactly.
UPDATE users
SET achieved_tier = CASE
  WHEN TIMESTAMPDIFF(WEEK, created_at, NOW()) >= 10
       AND post_count >= 100 AND comment_count >= 1000 AND visit_count >= 150 THEN 3
  WHEN TIMESTAMPDIFF(WEEK, created_at, NOW()) >= 1
       AND post_count >= 10 AND comment_count >= 70 AND visit_count >= 10 THEN 2
  WHEN post_count >= 1 AND comment_count >= 20 AND visit_count >= 3 THEN 1
  ELSE 0
END;
