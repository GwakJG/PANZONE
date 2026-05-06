// Blocks nicknames that contain brand names (PUBG·Krafton), the service's own
// name (PanZone), or staff-impersonation terms (admin / 관리자 / 운영자 / etc).
// Case-insensitive substring match so variants like "PUBGKing" / "pubg_master"
// are also caught. Enforced at signup, nickname change, and the nickname
// availability check.

// 과잉 차단 주의: '배그' / '펍지' 같은 한글 슬랭은 PUBG 커뮤니티의 일상
// 표현이라 닉네임 구성 요소로 자연스럽게 쓰임 (예: '배그고수'). 블록은
// 명확한 사칭 의도가 드러나는 영문·정식 브랜드명과 관리자/시스템 예약어에
// 한정함.
const BLOCKED_SUBSTRINGS = [
  // PUBG 공식 · 퍼블리셔 (영문/정식명만)
  'pubg', 'krafton', 'battlegrounds', 'bluehole',
  '크래프톤', '블루홀',

  // PanZone 자사 브랜드 (사칭 방지)
  'panzone', '판존', '팬존',

  // 운영진 / 관리자 사칭
  'admin', 'administrator', 'mod', 'moderator', 'operator', 'staff',
  '관리자', '운영자', '매니저', '스탭',

  // 시스템 예약어
  'system', 'official', 'support',
  '공식', '고객센터',
]

function isBlockedNickname(name) {
  if (typeof name !== 'string' || !name) return false
  const lower = name.toLowerCase()
  return BLOCKED_SUBSTRINGS.some(w => lower.includes(w.toLowerCase()))
}

module.exports = { isBlockedNickname, BLOCKED_SUBSTRINGS }
