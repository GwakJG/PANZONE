// 런칭용 기본 공지 13개를 notice 보드에 일괄 등록/갱신.
//
// 멱등 — 같은 title 이 이미 있으면 body 만 UPDATE, 없으면 INSERT.
// 정렬 — 1번(환영 인사)이 최상단에 오도록 created_at 을 역순으로 부여.
//        re-run 시 created_at 도 함께 갱신해서 정렬 안정 유지.
//
// 실행: node backend/scripts/seed_foundational_notices.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const { pool } = require('../db')

// =====================================================================
// 본문 빌딩 헬퍼 — 인라인 스타일로 카드/콜아웃/섹션 통일된 룩 만들기
// =====================================================================

function lead(text) {
  return `<p style="font-size:16px;color:var(--text-secondary);margin:0 0 28px;padding-bottom:16px;border-bottom:1px dashed var(--border);">${text}</p>`
}

function section(emoji, title) {
  return `<h3 style="margin:32px 0 14px;font-size:18px;">${emoji} ${title}</h3>`
}

function callout(icon, label, body, color = 'var(--primary)') {
  return `<div style="margin:20px 0;padding:14px 18px;background:var(--surface);border-left:4px solid ${color};border-radius:4px;">
  <strong style="color:${color};font-size:13px;">${icon} ${label}</strong>
  <div style="margin-top:6px;line-height:1.7;">${body}</div>
</div>`
}

function warning(label, body) {
  return callout('⚠️', label, body, 'var(--danger)')
}

function info(label, body) {
  return callout('💡', label, body, 'var(--primary)')
}

const TBL = 'width:100%;margin:14px 0;border-collapse:collapse;'
const TH = 'padding:10px 12px;text-align:left;background:var(--surface);border-bottom:2px solid var(--border);font-size:14px;'
const TD = 'padding:10px 12px;border-bottom:1px solid var(--border);vertical-align:top;'

// 사이트 UserTierBadge 와 동일한 SVG 모양 (크기만 살짝 키움 — 26x10 → 48x20).
function tierBullet(tier) {
  const colors = {
    1: { body: '#cd7f32', rim: '#8b5a2b' },
    2: { body: '#c0c0c0', rim: '#808080' },
    3: { body: '#ffd700', rim: '#b8860b' },
    4: { body: '#b9f2ff', rim: '#3498db' },
  }
  const c = colors[tier]
  if (!c) return ''
  return `<svg width="52" height="22" viewBox="0 0 40 18" style="vertical-align:middle;" aria-hidden="true">
  <path d="M 3 3 L 22 3 Q 36 9 22 15 L 3 15 Z" fill="${c.body}" stroke="${c.rim}" stroke-width="1.5" stroke-linejoin="round"/>
  <rect x="2.5" y="3" width="3" height="12" fill="${c.rim}"/>
  <line x1="22" y1="3" x2="22" y2="15" stroke="${c.rim}" stroke-width="1" opacity="0.55"/>
</svg>`
}

const tierChick = `<span style="font-size:22px;vertical-align:middle;">🐣</span>`

// =====================================================================
// 본문 13개
// =====================================================================

const NOTICES = [
  {
    title: 'PanZone에 오신 것을 환영합니다 🎉',
    body: `${lead('PUBG 전적 검색과 커뮤니티를 한 곳에 모은 비공식 팬 사이트, PanZone에 오신 것을 환영합니다.')}

${section('🎮', '주요 기능')}
<ul style="line-height:2;padding-left:22px;margin:0 0 16px;">
  <li><strong>전적 검색</strong> — 스팀·카카오 닉네임으로 시즌 통계, 매치 히스토리, 매치 상세를 빠르게 조회</li>
  <li><strong>커뮤니티 게시판</strong> — 자유·QA·자랑·스트리머·e스포츠·구매후기·세팅·제보·디스코드 홍보</li>
  <li><strong>Hot 게시판</strong> — 오늘/이번 주 인기 글 자동 집계</li>
  <li><strong>자동 동기화 보드</strong> — 패치노트·이벤트·확률형 아이템 정보를 PUBG 공식 페이지에서 자동 수집</li>
</ul>

${section('🔰', '시작하기 좋은 글')}
<ul style="line-height:2;padding-left:22px;margin:0 0 16px;">
  <li>커뮤니티 이용 규칙</li>
  <li>등업 시스템 안내</li>
  <li>PUBG 전적 검색 사용 안내</li>
  <li>자주 묻는 질문 (FAQ)</li>
</ul>

${warning('비공식 안내', 'PanZone은 <strong>KRAFTON 및 PUBG STUDIOS와 무관한 비공식 팬 사이트</strong>입니다. 게임 내 콘텐츠·이미지·로고의 저작권은 모두 KRAFTON에 있으며, 본 사이트는 정보 제공 및 커뮤니티 목적으로만 운영됩니다.')}

<p style="margin-top:24px;text-align:center;color:var(--text-secondary);">즐거운 PUBG 라이프 보내세요! 🐔</p>`,
  },

  {
    title: '커뮤니티 이용 규칙 안내',
    body: `${lead('건강한 커뮤니티를 위해 모두가 함께 지키는 기본 규칙입니다.')}

${section('🚫', '금지 콘텐츠')}
<ul style="line-height:2;padding-left:22px;margin:0 0 16px;">
  <li>욕설·비방·인신공격·혐오 표현</li>
  <li>스팸·도배·반복 게시</li>
  <li>광고·홍보·유료 서비스 권유 <span style="color:var(--text-secondary);font-size:13px;">(디스코드 홍보 게시판 제외)</span></li>
  <li>음란물·선정적 이미지·청소년 유해 콘텐츠</li>
  <li>개인정보(실명·전화번호·주소·계정 등) 무단 노출</li>
  <li>저작권 침해 자료, 핵·치트·계정 거래·작업장 광고</li>
  <li>허위 정보·악의적 사칭</li>
</ul>

${section('⚖️', '처벌 단계')}
<table style="${TBL}">
  <thead>
    <tr><th style="${TH}">단계</th><th style="${TH}">조치</th></tr>
  </thead>
  <tbody>
    <tr><td style="${TD}">가벼운 위반</td><td style="${TD}">글·댓글 삭제 + 알림 통보</td></tr>
    <tr><td style="${TD}">반복 위반</td><td style="${TD}">계정 일시 정지</td></tr>
    <tr><td style="${TD}">중대 위반<br><span style="color:var(--text-secondary);font-size:13px;">(개인정보 노출, 사칭, 작업장 등)</span></td><td style="${TD}">영구 정지</td></tr>
  </tbody>
</table>

${info('신고 방법', '각 게시물·댓글 우측의 <strong>⋯ 메뉴 → 신고하기</strong> 버튼을 사용해 주세요. 자세한 절차는 <em>"게시물·댓글 신고하는 방법"</em> 공지를 참고하세요.')}`,
  },

  {
    title: '등업 시스템 안내',
    body: `${lead('PanZone은 활동량에 따라 등급이 자동으로 올라가는 시스템을 운영합니다.')}

${section('🏅', '등급 단계')}
<table style="${TBL}">
  <thead>
    <tr>
      <th style="${TH}">뱃지</th>
      <th style="${TH}">등급</th>
      <th style="${TH}">조건</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="${TD};text-align:center;">${tierChick}</td>
      <td style="${TD}"><strong>새내기</strong></td>
      <td style="${TD}">가입 직후 (기본)</td>
    </tr>
    <tr>
      <td style="${TD};text-align:center;">${tierBullet(1)}</td>
      <td style="${TD}"><strong>동색 총알</strong></td>
      <td style="${TD}">글 1개 / 댓글 20개 / 접속일 3일</td>
    </tr>
    <tr>
      <td style="${TD};text-align:center;">${tierBullet(2)}</td>
      <td style="${TD}"><strong>은색 총알</strong></td>
      <td style="${TD}">가입 1주 이상 + 글 10개 / 댓글 70개 / 접속일 10일</td>
    </tr>
    <tr>
      <td style="${TD};text-align:center;">${tierBullet(3)}</td>
      <td style="${TD}"><strong>금색 총알</strong></td>
      <td style="${TD}">가입 10주 이상 + 글 100개 / 댓글 1000개 / 접속일 150일</td>
    </tr>
    <tr>
      <td style="${TD};text-align:center;">${tierBullet(4)}</td>
      <td style="${TD}"><strong>다이아 총알</strong></td>
      <td style="${TD}">관리자·운영진 전용</td>
    </tr>
  </tbody>
</table>

${section('📝', '꼭 알아두세요')}
<ul style="line-height:2;padding-left:22px;margin:0 0 16px;">
  <li><strong>등급은 한 번 오르면 떨어지지 않습니다</strong> — 활동이 줄어도 그대로 유지됩니다.</li>
  <li><strong>접속일</strong>은 하루 1회만 카운트됩니다.</li>
  <li><strong>다이아 총알</strong>은 운영진 전용 뱃지로, 일반 유저는 도달할 수 없습니다.</li>
</ul>

${warning('댓글 카운트 규칙 (파밍 방지)', '본인 글에 단 <strong>최상위 댓글</strong>은 카운트되지 않습니다. 다른 사람 글에 단 댓글, 또는 본인 글에 달린 <strong>대댓글</strong>만 +1됩니다.')}`,
  },

  {
    title: '게시물·댓글 신고하는 방법',
    body: `${lead('부적절한 글이나 댓글을 발견했을 때 신고 기능을 사용해 주세요.')}

${section('🚨', '신고 절차')}
<ol style="line-height:2;padding-left:22px;margin:0 0 16px;">
  <li>대상 게시물·댓글 우측의 <strong>⋯ 메뉴 → 신고하기</strong> 클릭</li>
  <li>신고 사유 선택 <span style="color:var(--text-secondary);font-size:13px;">(최대 2개)</span></li>
  <li>상세 설명 입력 <span style="color:var(--text-secondary);font-size:13px;">(선택, 1000자 이내)</span></li>
  <li>증거 이미지 첨부 <span style="color:var(--text-secondary);font-size:13px;">(선택, 최대 2장)</span></li>
  <li>제출 → 관리자 알림</li>
</ol>

${section('📋', '신고 사유 7종')}
<table style="${TBL}">
  <thead>
    <tr><th style="${TH}">사유</th><th style="${TH}">설명</th></tr>
  </thead>
  <tbody>
    <tr><td style="${TD}"><strong>스팸</strong></td><td style="${TD}">도배·광고·무의미 반복</td></tr>
    <tr><td style="${TD}"><strong>욕설/비방</strong></td><td style="${TD}">인신공격, 혐오 표현</td></tr>
    <tr><td style="${TD}"><strong>음란물</strong></td><td style="${TD}">선정적·노출 콘텐츠</td></tr>
    <tr><td style="${TD}"><strong>개인정보</strong></td><td style="${TD}">실명·연락처·계정 등 무단 공개</td></tr>
    <tr><td style="${TD}"><strong>허위/사칭</strong></td><td style="${TD}">거짓 정보, 타인·기관 사칭</td></tr>
    <tr><td style="${TD}"><strong>부적절</strong></td><td style="${TD}">위 사유에 정확히 해당하지 않는 부적절한 내용</td></tr>
    <tr><td style="${TD}"><strong>기타</strong></td><td style="${TD}">위 카테고리에 없는 사유 (상세 설명 필수)</td></tr>
  </tbody>
</table>

${section('✅', '처리 안내')}
<ul style="line-height:2;padding-left:22px;margin:0 0 16px;">
  <li>관리자 검토 후 글·댓글 삭제 또는 작성자 정지 조치</li>
  <li>처리 결과는 신고자에게 알림으로 통보</li>
</ul>

${warning('허위 신고 주의', '허위 신고를 반복할 경우 <strong>신고자 본인이 제재 대상</strong>이 될 수 있습니다.')}`,
  },

  {
    title: '계정 정지 정책 안내 (30일 유예)',
    body: `${lead('운영 규칙 위반 시 계정 정지가 부과될 수 있으며, 정지된 계정은 다음 정책에 따라 처리됩니다.')}

${section('🔒', '정지 후 가능한 활동')}
<ul style="line-height:2;padding-left:22px;margin:0 0 16px;">
  <li>로그인 가능, <strong>읽기 전용</strong></li>
  <li>글·댓글·신고·추천 작성 불가</li>
  <li>본인 프로필·작성 글·댓글 열람 가능 <span style="color:var(--text-secondary);font-size:13px;">(다른 사용자에겐 숨김)</span></li>
</ul>

${section('⏰', '30일 유예 정책')}
<table style="${TBL}">
  <thead>
    <tr>
      <th style="${TH}">경과 기간</th>
      <th style="${TH}">상태</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="${TD}"><strong>0 ~ 29일</strong></td>
      <td style="${TD}">관리자 해제 가능. 글·댓글은 다른 유저에겐 안 보이지만 데이터 유지.</td>
    </tr>
    <tr>
      <td style="${TD}"><strong>30일 이후</strong></td>
      <td style="${TD}"><strong style="color:var(--danger);">자동 데이터 파기</strong> — 글·댓글 영구 삭제, 프로필 초기화.</td>
    </tr>
    <tr>
      <td style="${TD}">이후</td>
      <td style="${TD}">이메일·닉네임 영구 잠금. 동일 계정 재가입 불가.</td>
    </tr>
  </tbody>
</table>

${section('📮', '이의제기 (문의하기)')}
<p style="line-height:1.8;margin:0 0 12px;">정지 처분이 부당하다고 판단되면 본인 프로필 상단의 <strong>빨간 배너 → 문의하기</strong> 버튼을 사용해 주세요.</p>
<ul style="line-height:2;padding-left:22px;margin:0 0 16px;">
  <li>1000자 이내 상세 설명 + 이미지 2장 첨부 가능</li>
  <li>관리자 검토 후 결과 통보</li>
  <li><strong>해제 시 글·댓글이 원래 위치로 자동 복원</strong>됩니다</li>
</ul>`,
  },

  {
    title: '자동 동기화 게시판 안내',
    body: `${lead('PanZone의 일부 게시판은 PUBG 공식 사이트에서 콘텐츠를 자동으로 가져옵니다.')}

${section('🔄', '대상 게시판 및 업데이트 시간')}
<table style="${TBL}">
  <thead>
    <tr>
      <th style="${TH}">게시판</th>
      <th style="${TH}">업데이트 주기</th>
      <th style="${TH}">출처</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="${TD}"><strong>패치노트</strong></td>
      <td style="${TD}">매주 화요일 18시 (KST)</td>
      <td style="${TD}"><span style="color:var(--text-secondary);font-size:13px;">Steam News + pubg.com 한국어</span></td>
    </tr>
    <tr>
      <td style="${TD}"><strong>이벤트 게시판</strong></td>
      <td style="${TD}">매일 오전 9시 (KST)</td>
      <td style="${TD}"><span style="color:var(--text-secondary);font-size:13px;">pubg.com 이벤트 페이지</span></td>
    </tr>
    <tr>
      <td style="${TD}"><strong>확률형 아이템</strong></td>
      <td style="${TD}">매주 수요일 11시 20분 (KST)</td>
      <td style="${TD}"><span style="color:var(--text-secondary);font-size:13px;">pubg.com 확률 공개 페이지</span></td>
    </tr>
  </tbody>
</table>

${section('📌', '이용 안내')}
<ul style="line-height:2;padding-left:22px;margin:0 0 16px;">
  <li>해당 게시판에는 <strong>일반 사용자가 글을 작성할 수 없습니다</strong></li>
  <li><strong>댓글은 자유롭게 작성 가능</strong>합니다</li>
  <li>새 콘텐츠가 추가되면 자동으로 게시판 최상단에 노출</li>
  <li>PUBG 측에서 종료된 이벤트는 자동으로 정리될 수 있습니다</li>
</ul>

${info('Tip', '각 게시판 페이지 제목 옆에 표시된 업데이트 시간을 참고하세요.')}`,
  },

  {
    title: '닉네임 규정 안내',
    body: `${lead('닉네임은 다른 사용자에게 표시되는 식별자이므로 아래 규정을 따릅니다.')}

${section('🚫', '사용 금지 단어')}
<table style="${TBL}">
  <thead>
    <tr><th style="${TH}">유형</th><th style="${TH}">예시</th></tr>
  </thead>
  <tbody>
    <tr>
      <td style="${TD}"><strong>공식 사칭</strong></td>
      <td style="${TD}">PUBG, KRAFTON, BLUEHOLE, PUBG STUDIOS</td>
    </tr>
    <tr>
      <td style="${TD}"><strong>운영진 사칭</strong></td>
      <td style="${TD}">관리자, admin, moderator, mod, 운영자, 운영팀</td>
    </tr>
    <tr>
      <td style="${TD}"><strong>PanZone 공식 사칭</strong></td>
      <td style="${TD}">PanZone, 판존 (단독 사용)</td>
    </tr>
  </tbody>
</table>

${info('허용 예외', '슬랭 표현(예: "배그짱", "치킨킹")처럼 사칭 의도가 없는 단어는 허용됩니다.')}

${section('✏️', '닉네임 변경')}
<ul style="line-height:2;padding-left:22px;margin:0 0 16px;">
  <li>프로필 페이지 → 편집 → 닉네임 입력</li>
  <li>입력 시 중복·금지어 검사 자동 실행</li>
  <li>욕설·혐오·선정적 닉네임은 관리자가 강제 변경할 수 있습니다</li>
</ul>

${section('📝', '그 외')}
<ul style="line-height:2;padding-left:22px;margin:0 0 16px;">
  <li>한글·영문·숫자 혼용 가능</li>
  <li>특수문자는 일부만 허용</li>
  <li>다른 사용자가 이미 사용 중인 닉네임은 사용 불가</li>
</ul>`,
  },

  {
    title: '이용약관 및 개인정보처리방침 안내',
    body: `${lead('PanZone 서비스 이용에 필요한 두 문서를 안내드립니다.')}

${section('📜', '이용약관')}
<p style="line-height:1.8;margin:0 0 12px;">서비스 범위, 사용자 권리·의무, 콘텐츠 책임, 분쟁 해결 등 <strong>14개 조항</strong>으로 구성됩니다.</p>
<p style="margin:0 0 16px;"><a href="/terms" target="_blank" rel="noopener" style="color:var(--primary);text-decoration:underline;">📄 이용약관 전문 보기</a></p>

${section('🔐', '개인정보처리방침')}
<p style="line-height:1.8;margin:0 0 12px;">수집 항목, 이용 목적, 보관 기간, 제3자 제공, 수탁자(Resend·AdSense 등) 등 <strong>12개 섹션</strong>으로 구성됩니다.</p>
<p style="margin:0 0 16px;"><a href="/privacy" target="_blank" rel="noopener" style="color:var(--primary);text-decoration:underline;">📄 개인정보처리방침 전문 보기</a></p>

${warning('만 14세 미만 가입 불가', '청소년 보호를 위해 <strong>만 14세 미만은 가입할 수 없습니다</strong>.')}

${section('📌', '중요 사항')}
<ul style="line-height:2;padding-left:22px;margin:0 0 16px;">
  <li>회원가입 시 두 문서에 동의하셔야 가입이 완료됩니다</li>
  <li>약관 변경 시 사전 공지하며, 변경 사항은 동일 게시판에 공지됩니다</li>
  <li>개인정보 관련 문의는 본인 프로필의 문의하기 또는 문의 메일을 이용해 주세요</li>
</ul>`,
  },

  {
    title: 'PUBG 전적 검색 사용 안내',
    body: `${lead('PanZone에서 PUBG 전적을 빠르게 조회하는 방법을 안내드립니다.')}

${warning('현재 테스트 운영 중', `
<p style="margin:0;line-height:1.7;">
  현재 PanZone은 PUBG 개발용(dev) API 키로 운영 중이라 <strong>분당 요청 한도가 매우 낮습니다</strong>.
  이로 인해 동시에 여러 검색이 들어오면 일시적으로 결과가 늦게 뜨거나 실패할 수 있습니다.
</p>
<p style="margin:8px 0 0;line-height:1.7;">
  현재 PUBG 측에 정식(Production) API 키 발급 및 한도 상향을 <strong>요청 중</strong>이며,
  지금은 <strong>테스트 운영 단계</strong>임을 양해 부탁드립니다. 한도가 상향되면 별도 공지를 통해 안내드리겠습니다.
</p>`)}

${section('🔍', '검색 방법')}
<ol style="line-height:2;padding-left:22px;margin:0 0 16px;">
  <li>헤더 상단의 검색창에 닉네임 입력</li>
  <li>플랫폼 선택 — <strong>스팀</strong> 또는 <strong>카카오</strong></li>
  <li>Enter 또는 검색 버튼 클릭</li>
</ol>

${section('📊', '제공 정보')}
<ul style="line-height:2;padding-left:22px;margin:0 0 16px;">
  <li>현재 시즌 및 과거 시즌 통계 (KD, 승률, 평균 데미지 등)</li>
  <li>최근 매치 히스토리</li>
  <li>매치별 상세 — 킬·생존 시간·이동 거리·플레이어 등</li>
  <li>모드별 분리 — 솔로/듀오/스쿼드, FPP/TPP</li>
</ul>

${warning('주의 사항', `
<ul style="line-height:1.9;padding-left:18px;margin:0;">
  <li>PUBG API 한도 또는 PUBG 서버 점검 시 일시적으로 검색이 실패할 수 있습니다</li>
  <li>카카오 계정은 PUBG API에서 일부 데이터만 제공할 수 있습니다</li>
</ul>`)}

${info('검색 기록', '<strong>로그인 상태</strong>에서 검색하면 검색 기록이 계정에 저장됩니다 — 다른 기기에서도 동일하게 접근 가능. <strong>로그아웃 상태</strong>에서는 저장되지 않습니다.')}`,
  },

  {
    title: '자동 로그인 사용 시 주의사항',
    body: `${lead('로그인 페이지의 "자동 로그인" 옵션 사용 안내입니다.')}

${section('⚙️', '옵션 동작')}
<table style="${TBL}">
  <thead>
    <tr>
      <th style="${TH}">설정</th>
      <th style="${TH}">유지 기간</th>
      <th style="${TH}">저장 위치</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="${TD}"><strong>✓ 체크 (자동 로그인 ON)</strong></td>
      <td style="${TD}">30일</td>
      <td style="${TD}"><span style="color:var(--text-secondary);font-size:13px;">localStorage<br>(브라우저 닫아도 유지)</span></td>
    </tr>
    <tr>
      <td style="${TD}">□ 미체크 <span style="color:var(--text-secondary);font-size:13px;">(기본값)</span></td>
      <td style="${TD}">세션 (1일)</td>
      <td style="${TD}"><span style="color:var(--text-secondary);font-size:13px;">sessionStorage<br>(브라우저 닫으면 로그아웃)</span></td>
    </tr>
  </tbody>
</table>

${section('🛡️', '안전한 사용법')}
<ul style="line-height:2;padding-left:22px;margin:0 0 16px;">
  <li><strong>본인 PC·휴대폰</strong> → 체크해도 안전</li>
  <li><strong>공용 PC·PC방·카페</strong> → <span style="color:var(--danger);">반드시 미체크</span> + 사용 후 로그아웃</li>
  <li>의심되는 로그인이 있다면 즉시 비밀번호 변경 (프로필 → 편집 → 비밀번호 변경)</li>
</ul>

${info('로그아웃 방법', '헤더 우측 계정 아이콘 → 로그아웃. 비밀번호 변경 시 자동으로 다른 모든 세션이 만료됩니다.')}`,
  },

  {
    title: '자주 묻는 질문 (FAQ)',
    body: `${lead('PanZone 이용 중 자주 만나는 상황들을 모았습니다.')}

${section('🔑', '회원가입 / 로그인')}
<p style="line-height:1.8;margin:0 0 6px;"><strong>Q. 회원가입 인증 메일이 안 와요</strong></p>
<p style="line-height:1.8;margin:0 0 18px;color:var(--text-secondary);">A. 스팸 메일함을 먼저 확인해 주세요. 5분 후에도 안 오면 재요청 가능합니다. 그래도 안 오면 다른 이메일 주소(Gmail·Naver 등)로 시도해 보세요.</p>

<p style="line-height:1.8;margin:0 0 6px;"><strong>Q. 비밀번호를 잊어버렸어요</strong></p>
<p style="line-height:1.8;margin:0 0 18px;color:var(--text-secondary);">A. 로그인 페이지의 "비밀번호 찾기" 버튼으로 등록된 이메일에 임시 비밀번호를 발급받을 수 있습니다.</p>

${section('👤', '프로필 / 활동')}
<p style="line-height:1.8;margin:0 0 6px;"><strong>Q. 닉네임 변경하고 싶어요</strong></p>
<p style="line-height:1.8;margin:0 0 18px;color:var(--text-secondary);">A. 프로필 페이지 → 편집 → 닉네임 항목에서 변경 가능합니다. 입력 시 중복 검사가 자동으로 실행됩니다.</p>

<p style="line-height:1.8;margin:0 0 6px;"><strong>Q. 정지된 계정 어떻게 풀어요?</strong></p>
<p style="line-height:1.8;margin:0 0 18px;color:var(--text-secondary);">A. 본인 프로필 상단의 빨간 배너에서 "문의하기" 버튼을 누르고 사유를 작성해 주세요. 관리자가 검토 후 답변드립니다.</p>

${section('🎮', '전적 / 검색')}
<p style="line-height:1.8;margin:0 0 6px;"><strong>Q. PUBG 검색 결과가 이상해요</strong></p>
<p style="line-height:1.8;margin:0 0 18px;color:var(--text-secondary);">A. PUBG API 한도 또는 PUBG 서버 점검으로 일시적으로 부정확한 결과가 나올 수 있습니다. 잠시 후 다시 시도해 주세요.</p>

${section('🎨', 'UI / 환경')}
<p style="line-height:1.8;margin:0 0 6px;"><strong>Q. 다크/라이트 테마를 바꾸고 싶어요</strong></p>
<p style="line-height:1.8;margin:0 0 18px;color:var(--text-secondary);">A. 헤더 우측 토글로 변경 가능합니다. 설정은 브라우저에 저장됩니다.</p>

<p style="line-height:1.8;margin:0 0 6px;"><strong>Q. 한국어/영어 변경하고 싶어요</strong></p>
<p style="line-height:1.8;margin:0;color:var(--text-secondary);">A. 헤더 우측 언어 토글로 변경 가능합니다.</p>`,
  },

  {
    title: '건의 사항 / 버그 신고 방법',
    body: `${lead('PanZone을 더 좋게 만드는 데 여러분의 의견이 큰 도움이 됩니다.')}

${section('📨', '건의·버그는 어디에?')}
<table style="${TBL}">
  <thead>
    <tr><th style="${TH}">유형</th><th style="${TH}">접수 채널</th></tr>
  </thead>
  <tbody>
    <tr>
      <td style="${TD}"><strong>일반 건의 / 기능 제안</strong></td>
      <td style="${TD}">자유게시판에 <code style="background:var(--surface);padding:2px 6px;border-radius:3px;">[건의]</code> 태그를 달아 작성</td>
    </tr>
    <tr>
      <td style="${TD}"><strong>버그 신고</strong></td>
      <td style="${TD}">자유게시판에 <code style="background:var(--surface);padding:2px 6px;border-radius:3px;">[버그]</code> 태그 + 발생 환경 + 재현 방법 명시</td>
    </tr>
    <tr>
      <td style="${TD}"><strong>계정 관련 문의</strong></td>
      <td style="${TD}">본인 프로필의 "문의하기"</td>
    </tr>
    <tr>
      <td style="${TD}"><strong>긴급 보안 이슈</strong></td>
      <td style="${TD}">메일로 직접 <span style="color:var(--text-secondary);font-size:13px;">(메일 주소는 추후 공지)</span></td>
    </tr>
  </tbody>
</table>

${section('🐛', '버그 신고 시 알려주시면 좋은 정보')}
<ul style="line-height:2;padding-left:22px;margin:0 0 16px;">
  <li>어떤 상황에서 발생했는지 (어느 페이지, 어떤 동작 후)</li>
  <li>재현 가능한지, 가능하다면 절차</li>
  <li>스크린샷 또는 캡처 영상 (선택)</li>
  <li>브라우저 / OS / 기기 정보</li>
</ul>

${info('응답 안내', '응답까지 영업일 기준 <strong>2~3일</strong> 정도 소요될 수 있습니다. 양해 부탁드립니다.')}`,
  },

  {
    title: 'PanZone 업데이트 노트 — v1.0 런칭',
    body: `${lead('PanZone v1.0 정식 런칭 시점의 주요 기능 정리입니다. 이후 업데이트는 본 게시판에 추가 공지로 올라갑니다.')}

${section('🎮', '전적 / 검색')}
<ul style="line-height:2;padding-left:22px;margin:0 0 16px;">
  <li>스팀·카카오 PUBG 닉네임 검색</li>
  <li>시즌 통계 + 최근 매치 + 매치 상세</li>
  <li>로그인 시 검색 기록 계정 단위 저장</li>
</ul>

${section('💬', '커뮤니티')}
<ul style="line-height:2;padding-left:22px;margin:0 0 16px;">
  <li>11개 게시판 (자유·QA·자랑·스트리머·e스포츠·후기·세팅·제보·디스코드 + 자동 동기화 3개)</li>
  <li>좋아요·싫어요 (게시글 상세), 댓글·대댓글, 신고, 추천 통계</li>
  <li>Hot 게시판 (오늘/이번 주 인기 글 자동 집계)</li>
  <li>홈 캐러셀 (관리자가 등록한 공지·관리자글·배너)</li>
</ul>

${section('🔐', '계정 / 보안')}
<ul style="line-height:2;padding-left:22px;margin:0 0 16px;">
  <li>이메일 인증 회원가입</li>
  <li>자동 로그인 옵션 (체크 시 30일 유지)</li>
  <li>등급 시스템 (5단계, 자동 등업)</li>
  <li>계정 정지 30일 유예 + 문의하기 이의제기</li>
  <li>회원 탈퇴 (비밀번호 재확인 → 30일 유예 → 자동 파기)</li>
</ul>

${section('⚙️', '운영 / 자동화')}
<ul style="line-height:2;padding-left:22px;margin:0 0 16px;">
  <li>패치노트 자동 동기화 (매주 화 18시)</li>
  <li>이벤트 자동 동기화 (매일 09시)</li>
  <li>확률형 아이템 자동 동기화 (매주 수 11:20)</li>
  <li>관리자 신고·문의 처리, 알림 시스템, 캐러셀 등록</li>
</ul>

<p style="margin-top:28px;text-align:center;color:var(--text-secondary);">이용해 주셔서 감사합니다. 좋은 의견은 언제든 환영합니다! 🙌</p>`,
  },
]

// =====================================================================
// DB 작업
// =====================================================================

async function pickAdminUserId() {
  const [rows] = await pool.query(
    "SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL ORDER BY id ASC LIMIT 1"
  )
  if (!rows.length) throw new Error('No admin user found.')
  return rows[0].id
}

async function getNoticeBoardId() {
  const [rows] = await pool.query("SELECT id FROM boards WHERE slug = 'notice' LIMIT 1")
  if (!rows.length) throw new Error('`notice` board not found.')
  return rows[0].id
}

async function main() {
  const [adminId, boardId] = await Promise.all([pickAdminUserId(), getNoticeBoardId()])
  console.log(`[notices] adminId=${adminId} boardId=${boardId}`)

  let inserted = 0, updated = 0

  for (let i = 0; i < NOTICES.length; i++) {
    const n = NOTICES[i]
    // i=0 가 가장 최신 created_at → 보드 최상단 노출.
    const offsetSec = i

    // 기존 글이 있으면 UPDATE, 없으면 INSERT
    const [dup] = await pool.query(
      'SELECT id FROM posts WHERE board_id = ? AND title = ? AND deleted_at IS NULL LIMIT 1',
      [boardId, n.title]
    )

    if (dup.length) {
      const postId = dup[0].id
      const conn = await pool.getConnection()
      try {
        await conn.beginTransaction()
        await conn.query(
          `UPDATE posts SET body = ?, created_at = NOW() - INTERVAL ? SECOND, updated_at = NOW()
            WHERE id = ?`,
          [n.body, offsetSec, postId]
        )
        // 썸네일 (post_images) 동기화 — body 안의 첫 <img> 또는 SVG 무시. 자동 추출 로직 재사용.
        await conn.query('DELETE FROM post_images WHERE post_id = ?', [postId])
        const m = n.body.match(/<img[^>]+src=["']([^"']+)["']/i)
        if (m && m[1] && m[1].length <= 500) {
          await conn.query(
            'INSERT INTO post_images (post_id, url, sort_order) VALUES (?, ?, 0)',
            [postId, m[1]]
          )
        }
        await conn.commit()
        console.log(`  [~] post=${postId}  ${n.title}`)
        updated++
      } catch (err) {
        await conn.rollback()
        console.error(`  [!] update ${n.title} failed: ${err.message}`)
      } finally {
        conn.release()
      }
    } else {
      const conn = await pool.getConnection()
      try {
        await conn.beginTransaction()
        const [r] = await conn.query(
          `INSERT INTO posts
             (board_id, user_id, title, body, is_pinned, admin_notice_at, created_at, updated_at)
           VALUES
             (?, ?, ?, ?, 1, NOW() - INTERVAL ? SECOND, NOW() - INTERVAL ? SECOND, NOW() - INTERVAL ? SECOND)`,
          [boardId, adminId, n.title, n.body, offsetSec, offsetSec, offsetSec]
        )
        await conn.commit()
        console.log(`  [+] post=${r.insertId}  ${n.title}`)
        inserted++
      } catch (err) {
        await conn.rollback()
        console.error(`  [!] insert ${n.title} failed: ${err.message}`)
      } finally {
        conn.release()
      }
    }
  }

  if (inserted > 0) {
    await pool.query('UPDATE users SET post_count = post_count + ? WHERE id = ?', [inserted, adminId])
  }

  console.log(`[notices] done. inserted=${inserted} updated=${updated}`)
  await pool.end()
}

main().catch(err => { console.error(err); process.exit(1) })
