# 배포 노트 — 2026-05-07 보안/품질 일괄 패치

이 문서는 이번에 진행한 작은 commit 8개를 운영 서버 panzone.org에 적용할 때 거쳐야 할 절차를 정리한 거야. 로컬 테스트 끝나고 사용자 명시 승인 후 진행.

## 적용된 commit (origin/main 기준 ahead)

```
ce4df7c Sanitize post bodies with sanitize-html (Phase D — XSS)
537b784 Validate uploads with magic-byte signature (Phase E)
29fcc64 Wrap multi-step writes in transactions (Phase I)
dce76c5 helmet, CORS origin lock, rate-limit on auth endpoints (Phase C)
db5c589 Login fallback to / + JSON 404 + global error handler (Phase H)
20afa3e Require NODE_ENV at boot; auto-set for npm run dev (Phase G)
2a53ce2 Fix stats refresh button doing nothing (Phase F)
d0e6be3 Critical security: JWT/forgot/admin/URL whitelist (Phase B)
91730cf Fix lint regressions: 7 errors → 0 (Phase A)
```

---

## 0. 사전 체크 (로컬에서 먼저)

```powershell
npm run lint        # 0 errors
npm run build       # 빌드 통과
```

수동 테스트 권장:
- 글 작성/수정 (sanitize 후 본문 깨짐 없는지 — 색상/표/이미지 보존)
- 비밀번호 찾기 — 미등록 이메일에도 동일 응답 (404 아님)
- 로그인 6번 연타 → 6번째부터 429
- 정상 png/jpg 업로드 OK, 텍스트 파일을 .png 이름으로 위장 → 거부
- 전적 검색 새로고침 버튼 동작 확인
- admin 알림에 `javascript:alert(1)` 입력 → linkUrl null 저장
- /forgot-password 성공 → 2초 안에 다른 페이지 이동 → 강제 navigate 없음

---

## 1. 시크릿 rotate (운영 서버에서)

`memory/project_deployment.md`에 노출된 시크릿 3종. **JWT 변경 시 모든 사용자 강제 로그아웃**.

```bash
ssh panzone@5.104.82.72
cd /opt/panzone

# 1) 새 JWT_SECRET 생성
NEW_JWT=$(openssl rand -hex 64)
echo $NEW_JWT          # 출력 후 .env에 반영

# 2) DB 비밀번호 새로
NEW_DB_PW=$(openssl rand -base64 24)
mysql -u root -p -e "ALTER USER 'pubgop_user'@'localhost' IDENTIFIED BY '$NEW_DB_PW';"
echo $NEW_DB_PW        # .env에 반영

# 3) PUBG API 키 — developer.pubg.com 에서 새로 발급 후 .env에

nano backend/.env      # 위 3개 + NODE_ENV=production 확인
```

서비스 공지 한 줄 띄우면 좋아: "잠시 후 보안 점검으로 자동 로그아웃됩니다."

---

## 2. 환경 변수 — 부팅 가드 신규 추가

`backend/.env`에 다음 키들이 모두 있어야 함:

```
NODE_ENV=production         ← 신규 — 없거나 production/development/test 외면 부팅 거부
JWT_SECRET=<rotate된 값>     ← 신규 가드 — 없으면 부팅 거부 (이전엔 dev fallback이 활성됨)
DB_HOST=localhost
DB_PORT=3306
DB_USER=pubgop_user
DB_PASSWORD=<rotate된 값>
DB_NAME=pubgop
PORT=3001
PUBG_API_KEY=<rotate된 값>
RESEND_API_KEY=<기존>
MAIL_FROM=<기존>
```

`.env.example`도 NODE_ENV 라인이 추가됐으니 참고.

---

## 3. 코드 + 의존성 배포

```bash
cd /opt/panzone
git fetch origin && git checkout main && git pull origin main

# 백엔드 새 의존성: sanitize-html, helmet, express-rate-limit, cross-env(devDep)
cd backend
npm install --production
cd ..

# 프런트엔드 빌드
npm install --production=false
npm run build
```

---

## 4. PM2 reload

```bash
pm2 reload panzone-api
pm2 status
pm2 logs panzone-api --lines 50    # 부팅 로그 확인
```

부팅 로그에 다음 보여야 함:
- `Backend running on http://localhost:3001`
- 마이그레이션 파일 새로 적용된 거 없음 (이번 패치는 마이그 안 추가)

부팅 거부되면 (.env에 NODE_ENV 또는 JWT_SECRET 누락):
```
[fatal] NODE_ENV must be one of: production, development, test. Got: undefined
[fatal] JWT_SECRET is required. Refusing to start with no secret.
```

---

## 5. 배포 후 검증

```bash
# helmet 헤더
curl -I https://panzone.org/api/health
# X-Content-Type-Options: nosniff, X-Frame-Options 확인

# CORS 잠금
curl -H "Origin: https://evil.example" https://panzone.org/api/health -I
# Access-Control-Allow-Origin이 panzone.org이거나 누락

# rate-limit
for i in {1..7}; do curl -X POST https://panzone.org/api/auth/login -d '{}' -H 'Content-Type: application/json'; echo; done
# 6번째부터 429 Too Many Requests

# enumeration 막혀있는지
curl -X POST https://panzone.org/api/auth/forgot-password -d '{"email":"random@nowhere.com"}' -H 'Content-Type: application/json'
# {"ok":true} (404 아니어야 함)
```

---

## 6. 적용된 변경 요약

### Critical (보안)
1. JWT_SECRET fallback 제거 + 부팅 가드
2. POST/PATCH/admin notice 본문 sanitize-html
3. 시크릿 rotate (절차만 정리)
4. Banner/Notification linkUrl javascript: 차단
5. Multer magic-byte 검증 (jpg/png/gif/webp 시그니처)
6. forgot-password 사용자 enumeration 제거
7. helmet + CORS origin 분기 + rate-limit
8. create_admin.js 가드 (NODE_ENV + 기존 admin 존재 시 거부)
9. NODE_ENV 부팅 가드

### High
10. suspensionPurge 트랜잭션화 (좀비 상태 방지)
11. POST /posts + DELETE /posts + comments POST/DELETE 트랜잭션
12. admin notice delete 조건부 UPDATE
13. comment counter atomic +1 (이전 풀스캔)
14. Login navigate(-1) → location.state.from || '/' 폴백
15. 글로벌 에러 미들웨어 + JSON 404
16. StatsTracker 새로고침 버그 fix

### Lint
17. 7 errors → 0

### 의도적으로 skip
- AuthContext useMemo (지난번 의심 case — 영향 없을 수도 있지만 보수적으로 skip)
- React.lazy 코드 스플리팅 (UX flicker 위험 — 별도 commit으로 분리 후 진행)
- syncReactionCounts atomic (2명 환경 영향 0)
- 마이그레이션 러너 multipleStatements (현재 마이그 다 안전)
- DB 042 인덱스 (데이터 적어 영향 없음)
- i18n 한국어 하드코딩 (한국 유저 중심)

---

## 7. 롤백 (필요 시)

```bash
cd /opt/panzone
git log --oneline -5
git checkout 807fb6d        # 패치 직전 시점
cd backend && npm install --production && cd ..
npm run build
pm2 reload panzone-api
```

JWT는 다시 rotate (이전 값 복원 금지 — 이미 노출된 시크릿).

---

## 8. 운영 노트

- `backend/.env`에 `NODE_ENV=production` 누락 시 부팅 거부 — 의도된 동작
- 신규 의존성: `sanitize-html`, `helmet`, `express-rate-limit`, `cross-env`(devDep)
- 신규 마이그레이션 없음 — schema_migrations 변경 X
- **nginx `client_max_body_size = 50M`** — `/etc/nginx/sites-available/panzone`에 박혀있음 (multer video 한도와 일치). git에 안 들어있는 설정이니 서버 재구축 시 빠뜨리지 말 것. 동영상 한도 바꾸면 multer + nginx 둘 다 같이 갱신.
