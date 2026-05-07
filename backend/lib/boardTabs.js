// Boards with internal category tabs. Tab keys are stored verbatim in
// `posts.subcategory`. Keep in sync with src/components/community/boards.js.
const BOARD_TABS = {
  discord: ['discord', 'clan', 'friend'],
  tip:     ['setting', 'gun', 'map', 'arcade'],
  report:  ['hack', 'highlight', 'fun'],
}

function hasTabs(slug) {
  return Object.prototype.hasOwnProperty.call(BOARD_TABS, slug)
}

function isValidTab(slug, key) {
  if (!hasTabs(slug)) return false
  return BOARD_TABS[slug].includes(key)
}

module.exports = { BOARD_TABS, hasTabs, isValidTab }
