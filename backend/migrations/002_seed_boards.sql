INSERT INTO boards (slug, name_ko, name_en, group_order, sort_order, board_type, is_writable) VALUES
  ('notice',   '공지사항',        'Notice',       1, 1, 'announcement', 0),
  ('patch',    '패치노트',        'Patch Notes',  1, 2, 'announcement', 0),
  ('event',    '이벤트',          'Events',       1, 3, 'announcement', 1),
  ('free',     '자유게시판',      'Free Board',   2, 1, 'user',         1),
  ('qa',       'QA게시판',        'Q&A',          2, 2, 'user',         1),
  ('pride',    '자랑 게시판',     'Showcase',     2, 3, 'user',         1),
  ('streamer', '스트리머 게시판', 'Streamers',    2, 4, 'user',         1),
  ('esports',  'e-sports 게시판', 'E-Sports',     2, 5, 'user',         1),
  ('review',   '구매 후기',       'Reviews',      2, 6, 'user',         1),
  ('loot',     '확률형 아이템',   'Loot Box Odds',3, 1, 'data',         0);
