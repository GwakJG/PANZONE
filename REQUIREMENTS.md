# PUBGOP - 요구사항 정리

## 개요
PUBG 전적 검색 + 커뮤니티 통합 웹 애플리케이션

## 기술 스택
- React + Vite (JavaScript)
- React Router (페이지 라우팅)
- CSS Variables 기반 테마 시스템
- 자체 다국어 시스템 (EN/KR)

---

## 1. Header (상단바)
- **좌측**: PUBGOP 로고 (홈 링크)
- **중앙 좌측**: Community / Stats Tracker 네비게이션
- **우측 (왼쪽→오른쪽)**: 커뮤니티 검색창 → 다국어 토글 → 테마 토글 → 로그인 버튼

## 2. 커뮤니티 검색 (Header 우측 검색창)
- 검색 기록: localStorage 저장, 최근 10개 표시, 개별/전체 삭제
- 검색창 클릭 시 드롭다운 (탭 필터 + 최근 검색어)
- 탭: Users / Titles Only / Content Only / Titles + Content
- 검색 실행 시 → `/community/search?q=검색어&tab=필터` 이동

## 3. Stats Tracker 검색
- 플랫폼 선택 (커스텀 셀렉트): Kakao / Steam
- 닉네임 입력 → 검색 시 프로필 페이지로 바로 이동 (검색창 숨김)
- 유저 없을 시 검색창 아래 에러 메시지 표시
- 뒤로가기 시 검색창 + History/Favorites 패널 복귀

## 4. Stats Tracker 프로필 페이지
### 프로필 헤더
- 아바타 (정사각형), 닉네임 (+ 복사 버튼 → 토스트 알림), 플랫폼 배지
- 새로고침 버튼, 최근 업데이트 시간, 즐겨찾기 토글

### 컨트롤 바
- FPP / TPP 토글 (전체 데이터 동기화)
- 시즌 선택 셀렉트

### 전적 카드 (2x2 그리드)
- 경쟁전 종합 / 경쟁전 모드별 (Solo/Duo/Squad)
- 전체 종합 / 전체 모드별 (Solo/Duo/Squad)
- 각 카드: 경기수+치킨 배지, K/D+Damage 강조, 9개 세부 스탯
- 데이터 없는 모드는 빈 상태 표시

### 상세 탭 (8개)
- 전체 / 전체 솔로 / 전체 듀오 / 전체 스쿼드
- 경쟁전 전체 / 경쟁전 솔로 / 경쟁전 듀오 / 경쟁전 스쿼드

### 최근 20게임 요약바
- 좌측: K/D, 데미지, 생존시간
- 우측: 평균 등수, 등수 이력 미니 박스 (1등=primary, Top10=연노랑)

### 매치 리스트
- 20개씩 표시 + 더보기 버튼
- 카드: 날짜/시간, 등수, 킬, 데미지, 이동거리, 팀원 닉네임
- 등수별 배경색 (1등=primary틴트, Top10=연노랑틴트)
- 카드 클릭 시 드롭다운 (전체순위 / 팀스탯 / 종합)
- 닉네임 클릭 시 해당 유저 전적 페이지로 이동

## 5. 테마 시스템
- Dark/Light 모드 토글, localStorage 저장
- Primary: #f6ac00 (공통)
- CSS Variables 기반 즉시 전환

## 6. 다국어 시스템
- EN/KR 토글, localStorage 저장
- 번역 파일: `locales/en.json`, `locales/ko.json`
- `t()` 함수 + 변수 치환 지원

## 7. History / Favorites
- 검색 기록: localStorage, 최근 20개
- 즐겨찾기: localStorage (추후 로그인 시 서버 저장)
- 카드 UI: 아바타, 닉네임, 플랫폼, 별 토글, 삭제
- Clear All 버튼

---

## 진행 상태
- [x] 프로젝트 초기 셋업 (React + Vite)
- [x] Header (로고, 네비, 검색, 다국어, 테마토글, 로그인)
- [x] 커뮤니티 검색 드롭다운 (탭 필터 + 검색 기록)
- [x] Dark/Light 테마 시스템
- [x] 다국어 시스템 (EN/KR)
- [x] Stats Tracker 검색 + 유저 없음 처리
- [x] 프로필 헤더 (아바타, 복사, 즐겨찾기, 새로고침)
- [x] FPP/TPP 토글 + 시즌 선택
- [x] 전적 카드 4개 (경쟁전/전체 × 종합/모드별)
- [x] 상세 탭 8개 + 최근 20게임 요약바
- [x] 매치 리스트 + 드롭다운 (전체순위/팀스탯/종합)
- [x] History / Favorites 패널
- [x] 토스트 알림
- [x] PUBG API 연동
- [ ] 로그인/회원가입 기능
- [ ] 커뮤니티 게시판 기능
