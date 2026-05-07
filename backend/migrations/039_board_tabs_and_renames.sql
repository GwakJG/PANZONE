-- Add per-post subcategory used by tabbed boards (discord/tip/report).
-- NULL means "no category" — those posts only show under the "전체" tab.
ALTER TABLE posts
  ADD COLUMN subcategory VARCHAR(32) NULL DEFAULT NULL AFTER body;

-- New board: 팁 게시판 (총기/맵/아케이드)
INSERT INTO boards (slug, name_ko, name_en, group_order, sort_order, board_type, is_writable)
VALUES ('tip', '팁 게시판(총기 · 맵 · 아케이드)', 'Tips', 2, 99, 'user', 1);

-- Renames (slug stays — only display labels change)
UPDATE boards SET name_ko = '홍보(디스코드 · 클랜 · 친구)', name_en = 'Promotion' WHERE slug = 'discord';
UPDATE boards SET name_ko = '제보 게시판(핵 · 명장면 · fun)', name_en = 'Reports'   WHERE slug = 'report';
UPDATE boards SET name_ko = '코디 게시판',                    name_en = 'Outfit'    WHERE slug = 'pride';

-- New sort order within group_order=2:
--   free=1, qa=2, setting=3, discord=4 (홍보), tip=5, pride=6 (코디),
--   streamer=7, esports=8, review=9, report=10
UPDATE boards SET sort_order = 1  WHERE slug = 'free';
UPDATE boards SET sort_order = 2  WHERE slug = 'qa';
UPDATE boards SET sort_order = 3  WHERE slug = 'setting';
UPDATE boards SET sort_order = 4  WHERE slug = 'discord';
UPDATE boards SET sort_order = 5  WHERE slug = 'tip';
UPDATE boards SET sort_order = 6  WHERE slug = 'pride';
UPDATE boards SET sort_order = 7  WHERE slug = 'streamer';
UPDATE boards SET sort_order = 8  WHERE slug = 'esports';
UPDATE boards SET sort_order = 9  WHERE slug = 'review';
UPDATE boards SET sort_order = 10 WHERE slug = 'report';
