export const SIDEBAR_SECTIONS = [
  [
    { kind: 'link', id: 'home', path: '/' },
  ],
  [
    { kind: 'board', id: 'notice' },
    { kind: 'board', id: 'patch' },
    { kind: 'board', id: 'event' },
  ],
  [
    { kind: 'board', id: 'free' },
    { kind: 'link', id: 'hot', path: '/community/hot' },
  ],
  [
    { kind: 'board', id: 'esports' },
    { kind: 'board', id: 'streamer' },
  ],
  [
    { kind: 'board', id: 'qa' },
    { kind: 'board', id: 'tip' },
    { kind: 'board', id: 'pride' },
  ],
  [
    { kind: 'board', id: 'discord' },
    { kind: 'board', id: 'report' },
  ],
  [
    { kind: 'board', id: 'loot' },
  ],
]

export const BOARD_GROUPS = SIDEBAR_SECTIONS
  .map(section => section.filter(it => it.kind === 'board').map(it => it.id))
  .filter(g => g.length > 0)

export const BOARDS = BOARD_GROUPS.flat()

export const DEFAULT_BOARD = 'notice'

const READ_ONLY_BOARDS = new Set(['notice', 'patch', 'event', 'loot'])

// Boards with internal category tabs.
// Tab keys are stored verbatim in `posts.subcategory`; labels resolved via
// `community.boardTabs.<board>.<key>` locale path.
export const BOARD_TABS = {
  discord: ['discord', 'clan', 'friend'],
  tip:     ['setting', 'gun', 'map', 'arcade'],
  report:  ['hack', 'highlight', 'fun'],
}

export function isValidBoard(id) {
  return BOARDS.includes(id)
}

export function canWrite(id) {
  return isValidBoard(id) && !READ_ONLY_BOARDS.has(id)
}

export function hasTabs(id) {
  return Object.prototype.hasOwnProperty.call(BOARD_TABS, id)
}

export function isValidTab(boardId, tabKey) {
  if (!hasTabs(boardId)) return false
  return BOARD_TABS[boardId].includes(tabKey)
}
