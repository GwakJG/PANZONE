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
    { kind: 'link', id: 'hot', path: '/community/hot' },
    { kind: 'board', id: 'free' },
    { kind: 'board', id: 'qa' },
    { kind: 'board', id: 'pride' },
    { kind: 'board', id: 'streamer' },
    { kind: 'board', id: 'esports' },
    { kind: 'board', id: 'review' },
    { kind: 'board', id: 'setting' },
    { kind: 'board', id: 'report' },
    { kind: 'board', id: 'discord' },
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

export function isValidBoard(id) {
  return BOARDS.includes(id)
}

export function canWrite(id) {
  return isValidBoard(id) && !READ_ONLY_BOARDS.has(id)
}
