-- Move all posts from the standalone 'setting' board into the 'tip' board
-- as `subcategory = 'setting'` so they show up under the new 세팅 tab.
UPDATE posts p
JOIN boards b_set ON b_set.id = p.board_id AND b_set.slug = 'setting'
JOIN boards b_tip ON b_tip.slug = 'tip'
SET p.board_id = b_tip.id,
    p.subcategory = 'setting';

-- Same migration applied to admin_notice_drafts which references board_slugs (JSON).
-- (Only matters if any saved draft targeted 'setting'; harmless if zero rows.)
UPDATE admin_notice_drafts
SET board_slugs = REPLACE(board_slugs, '"setting"', '"tip"')
WHERE JSON_CONTAINS(board_slugs, '"setting"');

-- Drop the now-empty board.
DELETE FROM boards WHERE slug = 'setting';

-- Refresh tip board display name to advertise the new tab.
UPDATE boards
SET name_ko = 'Tip(세팅 · 총기 · 맵 · 아케이드)'
WHERE slug = 'tip';
