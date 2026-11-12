# Overloader UI 리디자인 세션 인계 문서 (SESSION_HANDOFF.md)

작성 일시: 2026-11-05 17:45 (로컬 시간)  
현재 작업 브랜치: `feature/phase1-ui-cleanup-and-graphs` (미커밋 변경 보존 중)  
기반 커밋: `43cc325` (`docs: finalize SESSION_HANDOFF.md with production deployment status` on `main`)  
운영 배포 커밋: `43cc325` (main 브랜치 최신 상태 유지)  
리디자인 시작 전 원본 기준 커밋: `e43fa5669793a4e18e59cf9bdcddd21c0d5a020b`  
원격 보존 브랜치:
  * `backup/pre-redesign`: `e43fa56` (리디자인 시작 전 원본 고정 브랜치)
  * `backup/prod-pre-redesign-20261105`: `e43fa56` (배포 직전 main 원본 안전 백업)
  * `feature/redesign-shell-home`: `2618b00` (작업 브랜치)
  * `main`: `2618b00` (운영 반영 브랜치)
운영 접속 주소: `https://app.overloader.cloud` / `https://overloader.vercel.app`

---

## A. 프로젝트와 작업 목적

1. **작업 개요**:
   * 기존 Overloader 웹 애플리케이션의 Google OAuth 인증, 백엔드 FastAPI, PostgreSQL DB 스키마, 비즈니스 계산식 및 API 계약을 100% 보존하면서, 외부 시안(Readdy 디자인)을 참고하여 프론트엔드 UI를 탭 단위로 순차 재구현했습니다.
   * 공통 앱 셸 + 홈, 기록, 달력, 분석(4종), 건강(5종), 설정(텔레그램/Discord 포함), 브랜드 로고 홈 네비게이션, 강조색(Accent Color) 커스터마이징 전 기능 구현 및 사용자 디자인 승인을 완료하고 프로덕션에 성공적으로 배포했습니다.
2. **실제 기술 스택 및 실행 환경**:
   * **Frontend**: React 19.2.6, `react-scripts` 5.0.1 (CRA), Axios 1.16.0, Recharts 3.8.1, Pure Inline SVG (외부 CDN 없음), CSS Variables Design Token System (`tokens.css`).
   * **Backend**: FastAPI (Python 3.10+), PostgreSQL (`overloaderdb`), Uvicorn (`https://api.overloader.cloud`).
   * **배포 환경**: Vercel CI/CD (GitHub `kimarthurs/Overloader`의 `main` 브랜치 자동 배포).
   * **실행 명령**:
     * Frontend: `cd frontend; npm start` (기본 포트 3000 또는 3001)
     * Frontend 빌드 검증: `cd frontend; npm run build`
     * Backend: `uvicorn backend.main:app --host 0.0.0.0 --port 8000`

---

## B. 자료 위치와 우선순위

1. **자료 우선순위 원칙**:
   * **1순위 (최우선)**: 실제 인증, DB, 백엔드 API 계약 및 데이터 처리 (`App.js`, `auth.js`, `backend/main.py`, `schema-overview.md`).
   * **2순위 (시각적 기준)**: 승인된 이전 탭 구현 및 대상 화면의 PC/모바일 디자인 시안 (`design-reference/`).
   * **3순위 (참고용)**: 외부 인계 문서 및 안내 가이드 (데모 가정이나 가상의 API 명칭은 사실로 간주하지 않음).
2. **시안 자료 실제 경로**:
   * 로컬 저장소 내부: `C:\Users\Arthur\Documents\project\overloader\design-reference` (Git 미추적 상태 유지)
   * 데스크톱 PC 스크린샷 (14개): `design-reference/desktop/` (`1.png` ~ `14.png`)
   * 모바일 PDF 스크린샷 (14개): `design-reference/mobile/` (`1.pdf` ~ `14.pdf`)
   * 외부 안전 백업 경로: `C:\Users\Arthur\Documents\project\overloader_backups\design-reference` (총 30개 항목 검증 완료)
3. **화면별 대응표 (전체 탭 구현 및 배포 완료)**:
   * `1.png` / `1.pdf`: 홈 (`/`) — **승인 및 배포 완료** (`e599a57`)
   * `2.png` / `2.pdf`: 기록 > 근력 (`/record`) — **승인 및 배포 완료** (`988b433`)
   * `3.png` / `3.pdf`: 기록 > 유산소 (`/record`) — **승인 및 배포 완료** (`988b433`)
   * `4.png` / `4.pdf`: 달력 (`/calendar`) — **승인 및 배포 완료** (`5317734`)
   * `5.png` / `5.pdf`: 분석 > 볼륨 (`/analyze?tab=volume`) — **승인 및 배포 완료** (`e0e0106`)
   * `6.png` / `6.pdf`: 분석 > 1RM (`/analyze?tab=1rm`) — **승인 및 배포 완료** (`e0e0106`)
   * `7.png` / `7.pdf`: 분석 > 추세 (`/analyze?tab=trends`) — **승인 및 배포 완료** (`e0e0106`)
   * `8.png` / `8.pdf`: 분석 > 머신러닝 (`/analyze?tab=ml`) — **승인 및 배포 완료** (`e0e0106`)
   * `9.png` / `9.pdf`: 건강 > 바디 (`/health?tab=body`) — **승인 및 배포 완료** (`56d6681`)
   * `10.png` / `10.pdf`: 건강 > 유산소 통계 (`/health?tab=cardio`) — **승인 및 배포 완료** (`56d6681`)
   * `11.png` / `11.pdf`: 건강 > 식단 (`/health?tab=meal`) — **승인 및 배포 완료** (`56d6681`)
   * `12.png` / `12.pdf`: 건강 > 루틴 (`/health?tab=routine`) — **승인 및 배포 완료** (`56d6681`)
   * `13.png` / `13.pdf`: 건강 > AI 코칭 (`/health?tab=ai`) — **승인 및 배포 완료** (`56d6681`)
   * `14.png` / `14.pdf`: 설정 (`/settings`) — **승인 및 배포 완료** (`ea3251a`, `2618b00`)

---

## C. 사용자 승인 및 배포 상태

1. **공통 앱 셸 + 홈 화면**: 브라우저 확인 후 **디자인 및 동작 승인 완료** (체크포인트: `e599a57`)
2. **기록(Record) 탭**: 브라우저 확인 후 **디자인 및 인터랙션 승인 완료** (체크포인트: `988b433`)
3. **달력(Calendar) 탭**: 브라우저 확인 후 **디자인 및 화면 배치 승인 완료** (체크포인트: `5317734`)
4. **분석(Analyze) 탭**: 브라우저 확인 후 **디자인 및 화면 구성 승인 완료** (체크포인트: `e0e0106`)
5. **건강(Health) 탭 5종**: 브라우저 확인 후 **디자인 및 화면 구성 승인 완료** (체크포인트: `56d6681`)
6. **설정(Settings) 탭**: 브라우저 확인 후 **디자인 승인 완료** (체크포인트: `ea3251a`)
7. **추가 개선 항목**:
   - PC 사이드바 및 모바일 헤더의 로고 + 제목 클릭 시 홈 이동 버튼화 (키보드 포커스 링 지원).
   - 기본 번개 아이콘을 원본 브랜드 로고(`favicon-96x96.png`, 투명 배경 사이버 하트)로 교체.
   - 설정 화면에 강조색(Accent Color) 선택 기능 추가 (프리셋 8종, 네이티브 컬러 피커, HEX 직접 입력, 초기화 버튼, 실시간 적용, 로컬 스토리지 저장, FOUC 방지, 밝은 색 대비 자동 계산).
8. **최종 승인 및 배포**:
   - 브라우저 검증 후 전체 리디자인 승인 및 운영 배포 승인에 따라 원격 main 병합 및 Vercel 배포 완료 (`2618b00`).

---

## D. 구현 파일과 핵심 연결

1. **핵심 구현 파일 목록**:
   * `frontend/src/components/layout/AppShell.jsx`:
     * 데스크톱 240px 좌측 사이드바, 모바일 56px 헤더, 모바일 60px 5탭 바 (`홈`, `기록`, `달력`, `분석`, `건강`).
     * 브랜드 로고 버튼: 로고 이미지 + Overloader 텍스트 클릭 시 `onTabChange("home")` 호출 (키보드 포커스 지원, 기록 탭 초기화 동작 보존).
     * 설정 진입: 모바일 헤더 우측 톱니바퀴 아이콘 및 PC 사이드바 설정 메뉴.
   * `frontend/src/components/home/HomeScreen.jsx`:
     * 상단 오늘 세트 히어로 카드, 이번 달 요약 타일 3종, 최근 운동 카드(`GET /last-workout`), 미니 캘린더(`GET /logs?month=`), 바로가기 카드.
   * `frontend/src/components/record/RecordScreen.jsx`:
     * 실시간 타이머(`00:00`), 세션 세트 수 배지, 근력/유산소 모드 전환.
   * `frontend/src/components/calendar/CalendarScreen.jsx`:
     * 42칸 고정 그리드(6주 고정), 이전/다음 달 이동, '오늘' 바로가기, 범례(근력 주황 / 유산소 초록 닷).
   * `frontend/src/components/analyze/AnalyticsScreen.jsx`:
     * 볼륨, 1RM, 추세, 머신러닝 4종 서브탭 패널.
   * `frontend/src/components/health/HealthScreen.jsx`:
     * 바디, 유산소, 식단, 루틴, AI 코칭 5종 서브탭 패널.
   * `frontend/src/components/settings/SettingsScreen.jsx`:
     * 계정 정보/로그아웃, 다크/라이트 모드 토글, 강조색(Accent Color) 선택기, 홈 최근 운동 토글(`POST /settings/last-workout`), 텔레그램 연동 카드(`POST /settings/link-code` 및 새로고침), Discord 웹훅 설정 카드(마스킹 필드 및 `POST /settings/discord`).
   * `frontend/src/utils/accentColor.js`:
     * 강조색 유효성 검사, 호버색/배경색/대비(Luminance contrast) 계산, 로컬 스토리지 저장 및 CSS 변수(`--accent`, `--accent-hover`, `--accent-bg`, `--accent-contrast`) 적용.
   * `frontend/src/styles/tokens.css`:
     * 디자인 토큰, 테마 변수, 버튼, 알약 토글 스위치, 색상 프리셋 칩, 브랜드 홈 버튼 포커스 스타일.
   * `frontend/src/App.js`:
     * 탭 전환, 인증 세션, 테마/강조색 초기화.

---

## E. 반드시 보존할 기존 동작

1. **인증 및 세션 처리**:
   * `frontend/src/auth.js`의 토큰 보관 키(`"token"`, `"userName"`), Axios 요청 인터셉터의 Bearer 헤더 주입, 401 응답 시 세션 만료 인터셉터 보존.
2. **백엔드/DB/API 계약**:
   * 모든 쿼리 파라미터 및 엔드포인트 URL 형태 보존.
   * DB 컬럼명을 임의로 유추하거나 변경하지 않음 (`schema-overview.md` 준수).
3. **기록 탭 언마운트 초기화 동작 (기존과 동일)**:
   * 의도된 동작으로, 홈 로고 클릭이나 탭 바 전환 시에도 임의 전역화하지 않고 기존 동작을 유지함.

---

## F. 검증 상태 구분 보고

1. **실제 실행한 빌드 및 코드 검증 (성공)**:
   * `cd frontend; npm run build` -> **Exit Code 0** 성공 (산출물 gzip: main.js 219.62 kB, main.css 2.13 kB).
   * **Compiled successfully** (경고 0건).
2. **브라우저 확인 완료 항목**:
   * 홈, 기록, 달력, 분석, 건강, 설정 전 화면, 로고 홈 이동, 브랜드 아이콘, 강조색 커스텀
3. **운영 배포 검증 (성공)**:
   * `https://app.overloader.cloud` / `https://overloader.vercel.app`
   * HTML: Status 200 OK
   * 번들 JS: `main.c8f729ef.js` Status 200 OK (816,601 bytes)
   * CSS: `main.084b0a22.css` Status 200 OK (8,778 bytes)
   * 브랜드 로고: `favicon-96x96.png` Status 200 OK (14,422 bytes)
   * 백엔드 API: `https://api.overloader.cloud/docs` 200 OK, 비인증 엔드포인트 401 정상 보호 확인.
4. **미실행 검증 항목**:
   * 실제 운영 DB 대상 운동 기록 생성/수정/삭제, AI 추천 호출 등 데이터 변이 API 호출은 사용자 데이터 보호를 위해 실행하지 않음.

---

## G. Git 및 복구 기준

1. **브랜치 구조**:
   * `main`: 운영 배포 완료 브랜치 (`2618b00`)
   * `backup/pre-redesign`: 리디자인 시작 전 원본 영구 보존 브랜치 (`e43fa5669793a4e18e59cf9bdcddd21c0d5a020b`)
   * `backup/prod-pre-redesign-20261105`: 배포 직전 프로덕션 상태 보존 브랜치 (`e43fa5669793a4e18e59cf9bdcddd21c0d5a020b`)
   * `feature/redesign-shell-home`: 리디자인 작업 브랜치 (`2618b00`)
2. **체크포인트 커밋 이력**:
   * `e43fa56`: (기준 커밋) `feat: 메인 화면 즉시 로그아웃 추가...`
   * `e599a57`: `feat: implement common app shell and home screen redesign`
   * `988b433`: `feat: implement record tab redesign (strength and cardio panels)`
   * `5317734`: `feat: implement calendar tab redesign (month grid and day detail)`
   * `e0e0106`: `feat: implement analytics tab redesign (volume, 1rm, trends, ml)`
   * `56d6681`: `feat: redesign health screen with 5 subtabs (body, cardio, meal, routine, ai)`
   * `ea3251a`: `feat: redesign settings screen with account, theme, home option, telegram and discord cards`
   * `2618b00`: `feat: add brand logo home navigation and accent color customization` (운영 main 병합 완료)
3. **외부 안전 백업**:
   * 경로: `C:\Users\Arthur\Documents\project\overloader_backups\design-reference` (30개 파일 완전 보존)
4. **로컬 파일 상태 구분**:
   * `GEMINI.md`: Git 추적 파일 (커밋 보존 중)
   * `schema-overview.md`: 미추적 보존 문서
   * `design-reference/`: 미추적 보존 시안 디렉토리


---

## H. Phase 1 개선 작업 및 통합 계정 설계 인계

1. **Phase 1 구현 및 사용자 승인 상태**:
   * **승인 완료 (2026-11-06)**: 기록 탭 UI 정리(중복 `+` 제거, 괄호 숫자 제거, SVG 대체) 및 분석 추세 / 건강 바디 그래프 시범 개선에 대한 브라우저 확인 및 사용자 승인 완료.
   * **작업 브랜치**: `feature/phase1-ui-cleanup-and-graphs` (main과 격리).
   * **체크포인트 커밋**: `eb9b64f`.
   * **원격 및 배포 격리**: 원격 push, PR 병합, 프로덕션 배포, DB 쿼리 실행 없음 (main 최신 상태 유지).

2. **통합 계정 모델 확정 설계 메모 (Apple 제외, 경량화)**:
   * **지원 수단**: 아이디/비밀번호 + Google + Naver (Apple 및 이메일 인증/메일 발송은 전면 제외).
   * **엔터티 관계**: `users` 1 : 0..1 `password_credentials` (소셜 전용 사용자는 비밀번호 레코드가 없음).
   * **아이디/비밀번호 규칙**: 아이디/비밀번호 길이 및 허용 문자 규칙은 Step D 구현 전 최종 확정. 아이디는 이메일 형식(@)을 불허하여 향후 충돌 방지.
   * **연락처 이메일**: `users.email`은 선택 입력 미인증 연락처이며, 이메일 수정 시 `email_verified`는 즉시 `false`로 리셋.
   * **재인증 증거(Sudo Mode)**: 소셜 계정 연결/해제, 비밀번호 추가/변경 시에는 단순 로그인 JWT가 아닌 5~10분 유효기간의 별도 재인증 증거를 요구.
   * **마지막 수단 보호 및 인증 자격 정정**:
     - 정상 등록된 아이디/비밀번호는 이메일 인증 여부와 무관하게 완전히 유효한 로그인 수단으로 마지막 로그인 수단 계산에 포함됩니다.
     - 선택 연락처 이메일의 '미인증' 상태는 그 자체로 별도의 로그인/복구 수단이 아니라는 의미이며, 이메일이 미인증이라는 이유로 정상적인 아이디/비밀번호 로그인을 대체 수단에서 배제하지 않습니다.
     - 동시 해제 요청은 `SELECT ... FOR UPDATE` 행 잠금으로 원자적으로 검증하여 계정 내 유효 수단이 0개가 되는 것을 원천 차단합니다.
   * **비밀번호 분실 정책**: 이메일 링크 발송이 없으므로, 소셜 연동 계정은 소셜 로그인 후 재인증을 통해 재설정하며, 소셜 미연동 계정은 온라인 셀프 복구 불가 정책을 UI에 명확히 고지 (허위 비밀번호 찾기 버튼 미배치).
   * **DB 무결성 점검**: Step C 마이그레이션 전 읽기 전용 점검 쿼리로 중복/누락 데이터를 사전 보고.

3. **향후 독립 작업 단계 로드맵**:
   * **Step A (완료)**: Phase 1 UI/그래프 확인 및 체크포인트 커밋.
   * **Step B (구현 완료, 검증 대기)**: 과거 날짜 운동 기록 + 로컬 초안 보존 (DB 변경 없음).
   * **Step C**: 통합 계정 스키마 및 마이그레이션 (DB 사전점검 + DDL + Google 백필).
   * **Step D**: 아이디/비밀번호 + Google + Naver 인증 구현 & 설정 화면 계정 관리.
   * **Step E**: 다국어(i18n) 리소스 분리 및 텍스트 일괄 입력.
   * **Step F**: 운동 특성별 추천 정교화.

4. **Step B (과거 날짜 운동 기록 + 로컬 초안 보존) 구현 상세**:
   * **기준 시간대 확정**: `Asia/Seoul` (KST, UTC+9)을 업무 기준 시간대로 명시하여 프론트엔드 오늘/상한일, 서버 미래 날짜 검증, 알림 당일/과거일 판정에 동일 적용.
   * **백엔드 날짜 검증 (`backend/main.py`)**:
     - `validate_workout_date(date_str)` 신설: `YYYY-MM-DD` 정규식 및 유효 달력 날짜 검증, KST 오늘 초과 미래 날짜 차단(`400 Bad Request`).
     - `POST /record` 및 `POST /cardio`에 `date_str` 지원 및 당일이 아닌 경우 알림에 `({log_date} 기록)` 표시.
     - `date_str` 생략 시 하위 호환 폴백 유지.
   * **프론트엔드 모듈화**:
     - `frontend/src/utils/draftStorage.js`: `user_id` 네임스페이스 격리, `updatedAt` 기준 14일 TTL 정리, 12시간 초과 타이머 자동 보정, 다중 탭 충돌 감지, 스토리지 용량 초과 예외 방어.
     - `frontend/src/components/record/DateSelector.jsx`: KST 오늘 상한 날짜 피커, 이전/다음 날짜 이동, 오늘 복귀, 과거 기록 N일 전 배지.
     - `frontend/src/components/record/SavedLogsAccordion.jsx`: 서버 저장 기록(`GET /logs`, `GET /cardio`) 접이식 표시, 빠른 날짜 변경 시 늦은 응답 폐기(Race condition 방지), 네트워크 에러 시 0개 왜곡 방지 및 재시도 버튼 제공.
     - `frontend/src/components/record/RecordScreen.jsx`: 스냅샷 고정 저장, 5단계 세트 상태(`PENDING`, `SAVING`, `CONFIRMED_SUCCESS`, `CONFIRMED_FAILED`, `UNKNOWN`) 구분, 응답 유실 시 자동 재전송 금지 및 안내 배너 표시, 부분 성공 시 미저장 세트만 유지, 초안 수동 비우기 제공.

5. **기록 탭 UI 회귀 수정 및 시각적 정돈 (2026-11-06)**:
   * **원인 분석**:
     - Step B 구현 시 `RecordScreen.jsx` 내 입력창들에서 공통 스타일 클래스 `className="record-input"`이 누락되어 브라우저 기본 흰색 사각 입력창으로 렌더링됨.
     - `:root[data-theme="dark"]`에 `color-scheme: dark;`가 누락되어 브라우저 네이티브 `<input type="date">`의 달력 아이콘(`::-webkit-calendar-picker-indicator`)이 어두운 색으로 그려져 다크 배경에서 시인성이 저하됨.
     - 하단 제목이 여전히 `이번 운동 세트`로 표시되어 서버 저장 완료분과 미저장 초안의 구분이 모호했고, `SavedLogsAccordion`이 저장 건수 0건일 때 `null`을 반환하여 서버 기록 카드의 존재 여부를 사용자가 인지하기 어려웠음.
   * **수정 내용**:
     - `tokens.css`: `:root[data-theme="dark"]`에 `color-scheme: dark;`, `:root[data-theme="light"]`에 `color-scheme: light;` 적용. `.record-input::placeholder`의 가독성 향상. `.record-date-input` 클래스 신설 및 포커스 링 / 달력 아이콘 호버 효과 추가.
     - `RecordScreen.jsx`: 근력(운동명, 무게, 횟수) 및 유산소(종목명, 시간, 거리, 페이스, 경사도, 칼로리, 메모) 총 10개 입력창에 `className="record-input"` 복원. 하단 제목을 `작성 중인 세트`로 변경하고 보조 캡션 `아직 서버에 저장되지 않은 초안입니다` 추가.
     - `DateSelector.jsx`: `<input type="date">`에 `className="record-date-input"` 적용하여 다크 테마에서 달력 아이콘과 날짜 텍스트의 고대비 시인성 및 일관된 패딩/모서리 확보.
     - `SavedLogsAccordion.jsx`: 서버 저장 기록이 0건일 때도 `이 날짜에 저장된 기록 (0건) · 서버에 저장된 기록이 없습니다` 상태 카드를 명시하여 로딩/실패/0건/저장완료(N건) 상태를 사용자가 명확히 구분할 수 있도록 개선 (미저장 초안 목록과 완전 분리 유지).
   * **검증 상태 구분 (정확한 범위 한정)**:
     1. [UI 복원 확인] **사용자 브라우저 UI 육안 확인**: 기록 탭의 입력창 다크 테마와 날짜 피커 달력 아이콘이 정상적인 시인성으로 돌아온 것을 사용자가 브라우저에서 직접 확인하고 UI 회귀 수정을 승인함 (모든 세부 문구·개별 카드·비즈니스 기능을 항목별로 전체 승인한 것으로 확대 해석하지 않음).
     2. [컴파일 및 독립 시뮬레이션 통과]:
        - 프론트엔드 빌드(`npm run build`) 컴파일 성공 (에러 및 경고 0건, gzip 225.26 kB).
        - 백엔드 날짜 검증 로직(`validate_workout_date`) KST 기준 유효 달력 및 미래 차단 파이썬 단위 테스트 통과.
        - 파이썬 독립 시뮬레이션(`scratch/test_step_b.py`) 통과: 이는 파이썬 메모리 상에서 브라우저 스토리지 동작 및 상태 전이를 모사 검증한 것이며, 실제 브라우저 JS 런타임의 `draftStorage.js`나 React 상태 훅을 직접 구동한 통합 테스트가 아님.
     3. [미검증 유지] **별도 확인하지 않은 항목**:
        - 실제 PostgreSQL 운영 DB에 날짜별로 레코드가 인서트되는 통합 데이터 검증 (DB 변경 격리 준수를 위해 미실행).
        - 과거 날짜 기록 저장 시 텔레그램/Discord 실제 외부 웹훅 알림 발송 검증 (라이브 알림 미발송 준수를 위해 미실행).
        - 브라우저 실환경에서 며칠에 걸친 실제 날짜 전환 및 다중 탭 동시 입력 실시간 복원 검증.
   * **서버 멱등성 미구현 및 UNKNOWN 처리 한계 명시**:
     - 현재 DB 및 API에는 `client_set_id` 컬럼이나 고유 제약조건, 서버 Idempotency Key 메커니즘이 구현되어 있지 않으므로 **서버 측 멱등성은 미구현** 상태입니다.
     - 네트워크 타임아웃 등으로 응답을 수신하지 못했을 때 클라이언트는 해당 세트를 `UNKNOWN` 상태로 전환하여 '클라이언트 측의 무분별한 자동 재전송'만을 안전하게 억제합니다.
     - 따라서 실제 서버에 데이터가 도달했는지 여부는 클라이언트가 독자적으로 확정할 수 없으며, 사용자가 상단 '이 날짜에 저장된 기록' 조회를 통해 직접 중복 여부를 대조해야 하는 구조적 한계가 존재합니다.
   * **체크포인트 커밋 완료**: `3fc661d` (`feature/phase1-ui-cleanup-and-graphs`, 2026-11-06).

6. **Step C (통합 계정 스키마 및 마이그레이션) 진행 상태 및 로컬 테스트 결과**:
   * **진행 원칙**: 운영 DB(Azure) 및 실제 인증 코드는 일체 변경하지 않고, 복원된 로컬 격리 테스트 DB에서만 시험 적용 및 결과 검증 완료.
   * **사용자 PC 로컬 테스트 DB 시험 결과 (사용자 직접 실행 및 보고 내용)**:
     - **대상**: `127.0.0.1:5433 / overloaderdb_stepc_restore_test` (PostgreSQL 18, user: postgres)
     - **적용 후 검증 지표**:
       - `social_accounts`: 4건 생성 확인
       - `password_credentials`: 0건 확인
       - `mismatch_count`: 0건 (기존 `users.id`와 Google 식별자 1:1 매핑 완전 일치)
       - `users`: 4건 유지
       - `workout_logs`: 2,365건 유지
       - `cardio_logs`: 14건 유지
       - `body_logs`: 10건 유지
       - `meal_logs`: 24건 유지
       - **검증 종료 코드**: `0`
     - **사용자별 건수 분포**:
       - `user_id 2`: 근력 1,837 / 유산소 14 / 바디 10 / 식단 24
       - `user_id 13`: 근력 527 / 나머지 0
       - `user_id 14`: 전체 0
       - `user_id 16`: 근력 1 / 나머지 0
     - **적용 전후 비교 상태 (과장 배제 및 정확화)**:
       - 전체 테이블 행 수는 사전 기준선과 동일하게 유지됨.
       - 단, 전체 행 수 일치만으로 행 내용의 수정이나 유실/중복이 전혀 없다고 증명된 것은 아니며, **'전체 건수 동일, 사용자별 사전 비교 및 행 내용 비교 미검증'**으로 정확히 분류.
       - 제약조건 실제 정의 대조 완료 (사용자 직접 실행 및 보고): `pg_constraint` 실제 출력 확인 결과 핵심 제약 8개 및 NOT NULL 7개 포함 총 15개 행이 Step C 설계와 일치 확인 (종료 코드 0). 기존 17개 행 추정치는 폐기.
       - 마이그레이션 적용 후 검증 스크립트 실행 성공(종료 코드 0)과 마이그레이션 DDL 스크립트 자체의 터미널 COMMIT 출력 로그 및 종료 코드 기록은 분리하여 관리.
   * **검증 범위 한정 (확대 해석 엄격 금지)**:
     - Step C 로컬 시험은 현재 확인 범위(DDL 생성 및 Google 계정 백필 스크립트의 로컬 실행)에서 완료로 정리.
     - 실제 Google/Naver 로그인 인증 흐름, FastAPI 엔드포인트 연동, 운영 Azure DB 적용, 기존 행 내용 무변경은 일체 검증된 것이 아니며 '미검증' 상태를 유지.
   * **운영 준비 절차 단순화 및 백업 원칙**:
     - Windows 실행 환경: 인코딩 깨짐 방지를 위해 `$env:PGCLIENTENCODING = "UTF8"` 필수 적용.
     - `created_at` 기준 조회는 제한적인 신규 생성 확인일 뿐이며, 기존 행의 수정(UPDATE)이나 삭제(DELETE) 등 전체 변경 감지가 아님을 명시.
     - 운영 적용 직전 새 파일명(예: `overloaderdb_prod_pre_stepc_$(Get-Date -Format 'yyyyMMdd_HHmmss').dump`)으로 최신 pg_dump를 신규 생성하고 종료 코드, 파일 크기, 목차 읽기(`pg_restore --list`)를 확인하는 독립 절차 적용 (기존 검증된 백업 덮어쓰기 절대 금지).
     - 운영 사전 점검 및 백필 대상 건수는 로컬의 4명 수치를 하드코딩하지 않고, 실행 시점의 실제 데이터(`SELECT count(*) FROM users WHERE google_id IS NOT NULL`)로 동적 판단.
     - 운영 DDL 실행 시 `psql -X -v ON_ERROR_STOP=1` 및 단일 트랜잭션(`lock_timeout='3s'`, `statement_timeout='10s'`) 준수.

7. **Step C (통합 계정 스키마 및 백필) 운영 Azure DB 적용 완료 (2026-11-06)**:
   * **적용 방식 및 대상**:
     - 사용자가 운영 PowerShell 스크립트(`scripts/run_step_c_prod_migration.ps1`)를 직접 실행하여 단계별 검증 후 적용 완료.
     - 대상: `overloader.postgres.database.azure.com:5432 / overloaderdb` (PostgreSQL 18.6 on x86_64-pc-linux-gnu).
   * **사전 백업 생성 및 검증 결과**:
     - 프로젝트 외부 백업 경로(`C:\Users\Arthur\Documents\project\overloader_backups\db\`)에 신규 덤프 파일(`overloaderdb_prod_pre_stepc_*.dump`) 생성 확인.
     - `pg_dump` 종료 코드 0, 파일 크기 정상(0바이트 아님), 목차 전체 읽기(`pg_restore --list`) 검증 통과 (기존 백업 덮어쓰기 없음).
   * **사전 점검 및 DDL/백필 실행 결과 (사용자 제공 실행 로그 기준)**:
     - 읽기 전용 사전 점검(`precheck_step_c.sql`) 이상 없이 통과.
     - DDL 및 백필(`step_c_unified_auth.sql`): `INSERT 0 4`, `COMMIT`, 종료 코드 0으로 정상 완료.
     - 기존 `users.google_id` 4건이 `social_accounts` 테이블의 `google` provider 레코드 4건으로 1:1 백필 완료.
   * **사후 검증 결과 (`verify_post_migration.sql`)**:
     - `users` 테이블 내 Google 계정 수: 4건.
     - `social_accounts` 테이블 내 Google 계정 수: 4건.
     - `password_credentials` 테이블 건수: 0건.
     - `unmapped_users_count`: 0건 (누락 및 불일치 없음).
     - 제약조건 실제 정의: `pg_constraint` 기준 15개 행(핵심 제약 8개 + NOT NULL 7개) 설계 일치 확인.
     - 기존 주요 테이블 전체 건수 기준선 유지 확인: `users` 4, `workout_logs` 2,365, `cardio_logs` 14, `body_logs` 10, `meal_logs` 24.
     - 사후 검증 `DO` 블록 예외 없이 통과.
   * **중요: DB 상태와 Git 롤백 분리 고지**:
     - 실제 운영 DB(`overloaderdb`)의 스키마 변경(`email_verified` 컬럼 추가, `password_credentials`, `social_accounts` 테이블 생성 및 백필)은 이미 영구 커밋 적용되었습니다.
     - 따라서 향후 로컬 Git 브랜치에서 `git reset`이나 `git revert`를 수행하더라도 클라우드 DB는 롤백되지 않으며, DB 롤백이 필요할 경우 역방향 DDL 실행 또는 사전 생성된 외부 백업 덤프 복원을 통해서만 가능합니다.
   * **검증 범위 및 한계 엄격 준수**:
     - 본 작업은 **'운영 DB 스키마 생성 및 Google 계정 백필 완료'** 단계에 한정됩니다.
     - **사용자 로컬 브라우저 검증 (2026-11-06)**: `localhost` 환경에서 로그아웃 후 기존 Google 계정으로 정상 재로그인되는 것을 브라우저에서 직접 확인 완료.
     - **운영 배포 환경 미검증 유지**: 위 확인은 로컬 구동 기준이며, 실제 운영 배포 환경(`https://app.overloader.cloud`)에서의 동작 확인은 아니므로 배포 환경 검증으로 확대 해석하지 않고 엄격히 구분하여 미검증 유지.
     - 기존 서비스 안정성을 위해 `users.google_id` 컬럼은 그대로 유지되어 현재 프로덕션 인증 흐름에 영향을 주지 않습니다.
     - 실제 사용자 로그인 기능(아이디/비밀번호 신규 가입, Naver 연동 등 Step D 대상)은 아직 구현 전입니다.

8. **Step D (통합 계정 관리 및 일회성 저장소) 로컬 DB 동시성 검증 완료 및 계정 관리 로직 확장 (2026-11-06)**:
   * **적용 대상 및 환경**:
     - 사용자 PC 격리 로컬 전용 테스트 DB: `127.0.0.1:5433 / overloaderdb_stepd_test` (template0 기반 신규 생성, Step C 백업 복원 및 DDL 적용).
     - 기존 복원본(`overloaderdb_stepc_restore_test`) 및 운영 Azure DB(`overloaderdb`)는 일체 변경 없이 보존.
   * **사용자 직접 실행 및 검증 결과 (JUnit XML 기반 엄격 검증)**:
     - 실행 스크립트: `powershell -ExecutionPolicy Bypass -File scripts\run_step_d_local_tests.ps1 -TestOnly`
     - 테스트 결과: **8 passed, 1 warning (failures 0, errors 0, skipped 0)** 확인 완료.
     - **실제 실행된 8개 테스트 및 검증 범위**:
       1. `test_concurrent_reauth_ticket_consumption_exactly_one_succeeds`: 2개 동시 작업 스레드가 동일한 재인증 티켓 jti 소비 시 `SELECT FOR UPDATE`에 의해 정확히 1건만 성공하고 1건은 `TokenAlreadyConsumedError`로 차단됨을 검증.
       2. `test_concurrent_oauth_exchange_code_consumption_exactly_one_succeeds`: 2개 동시 작업 스레드가 동일한 OAuth 교환 코드 소비 시 정확히 1건만 성공하고 1건은 `TokenAlreadyConsumedError`로 차단됨을 검증.
       3. `test_transaction_rollback_preserves_unconsumed_ticket`: 트랜잭션 롤백 시 티켓 소비(`consumed_at`)도 함께 롤백되어 미소비 상태로 안전하게 보존됨을 검증.
       4. `test_password_change_revokes_previous_jwt_and_reauth_tickets`: `change_password_credential` 실행 후 `token_version` 증가 확인, 이전 발급 access JWT 거부(`TokenVersionMismatchError`), 기존 미소비 재인증 티켓 거부(`TokenBindingMismatchError`) 검증.
       5. `test_concurrent_unlink_last_method_protection`: 복제 SQL이 아닌 라우터가 사용하는 공용 서비스 함수(`unlink_password_credential`, `unlink_social_account`)를 2개 스레드가 동시 호출하여, 행 잠금 하에 정확히 1건만 성공하고 1건은 `LastLoginMethodError`로 차단되며 남은 로그인 수단이 정확히 1개 유지됨을 검증.
       6. `test_reauth_ticket_cross_user_session_purpose_rejected`: 타 사용자, 타 세션, 타 목적 티켓 불일치 거부 검증.
       7. `test_username_unique_collision_and_id_preservation`: 아이디 중복 등록 거부 및 기존 계정 무결성 보존 검증.
       8. `test_cleanup_expired_tokens`: 만료 및 1시간 초과 소비 토큰 정리 검증.
   * **경고 1건 확인**:
     - 서드파티 라이브러리 `anyio`의 pytest 플러그인 상위 호환성 사전 알림(`anyio/pytest_plugin.py:14: PytestRemovedIn10Warning: _pytest.python.CallSpec2 has been renamed to CallSpec`)으로, 기존에 확인된 경고와 동일하며 프로젝트 로직 및 실행 결과에 영향 없음.
   * **Step D 로컬 풀 번들 구현 완료 (2026-11-06)**:
     - **백엔드 (`backend/auth_router.py`, `backend/auth_service.py`)**:
       - Google/Naver OAuth 흐름 (login, link, reauth) 및 로컬 모의 제공자(`mock-consent`, `mock_code`) 구현.
       - 일회용 교환 코드 교환 엔드포인트(`POST /auth/v2/oauth/exchange`): URL 노출 없이 본문으로 JWT 반환, 원자적 1회 소비 및 60초 TTL 보장.
       - 소셜 재인증 기반 비밀번호 재설정(`POST /auth/v2/account/password/reset`): 소셜 본인인증 티켓 검증 후 비밀번호 갱신 및 `token_version` 증가.
       - 계정 관리 공용 서비스: `reset_password_credential`, `change_password_credential`, `add_password_credential`, `unlink_social_account`, `unlink_password_credential`, `get_account_methods_summary`.
        - 실제 Naver OAuth 연동 (`backend/auth_router.py`):
          - 인가 redirect_uri를 백엔드 콜백(`http://127.0.0.1:8000/auth/v2/oauth/naver/callback`)으로 고정 (클라이언트 임의 지정 차단).
          - 실제 인가코드 수신 시 네이버 토큰 교환(`https://nid.naver.com/oauth2.0/token`) 및 프로필 조회(`https://openapi.naver.com/v1/nid/me`) 비동기(httpx) 구현.
          - 네이버 고유 ID(`response.id`) 기준 계정 식별 및 이메일 미제공(None) 상태 정상 로그인/가입 지원.
          - 모의 제공자 보안 가드: 운영 환경(`ENV=production` 또는 `VERCEL`) 및 `USE_MOCK_OAUTH=false` 상태에서 요청의 `mock=true`나 `mock_uid`/`mock_code` 전송 시 403 Forbidden 즉시 차단.
        - 단위 테스트: `tests/test_auth_utils.py` (38건) + `tests/test_auth_router.py` (23건) = **61건 전건 통과**.
     - **프론트엔드 (`frontend/src/`)**:
       - `AuthScreen.jsx`:
         1. **브랜드 아이콘 및 헤더**: `design-reference/login.jpg` 시안을 반영하여 `⚡` 배지 대신 기존 오버로더 사이버 하트 로고 asset(`logo.png`)을 제목 위에 표시, 부제목을 "스마트한 운동기록 대시보드로 나의 헬스를 더 스마트하게!"로 통일, 모바일 반응형 비율 보존.
         2. **회원가입 아이디/이메일 분리**:
            - 아이디: 기본 안내(`아이디는 영문·숫자·밑줄(_)을 사용한 4~20자로 입력해 주세요.`), `@` 입력 시 즉시 차단 안내(`아이디에는 이메일 주소를 사용할 수 없습니다. 이메일은 아래 선택 입력란에 입력해 주세요.`) 실시간 반영.
            - 이메일 (선택): 입력 필드 추가, 미입력 시에도 가입 가능, 이메일 중복 차단 제약 없음(고유 제약 없음), 안내(`선택 입력이며, 현재 이메일 인증·비밀번호 복구에는 사용되지 않습니다.`), 최대 255자 및 정규식 백엔드(`POST /auth/v2/register`)와 동기화 검증, DB `users.email`에 저장 및 `email_verified = false` 유지.
         3. **닉네임 표기 통일**: 사용자 화면 전반(회원가입, 입력 라벨, 플레이스홀더, 오류 메시지, 모의 동의 화면)의 '표시 이름' 표기를 '닉네임'으로 통일 (DB `users.name` 컬럼 및 API 필드명은 유지).
         4. 소셜 재인증 비밀번호 재설정, OAuth 교환 코드 자동 수신 및 세션 초기화 연동 완료.
       - `AccountManagementCard.jsx`: 설정 화면 내 로그인 수단 목록(아이디/비밀번호, Google, Naver) 조회, 비밀번호 변경 모달(재인증+5대조건), 아이디/비밀번호 등록 모달, 소셜 연동/해제(마지막 수단 보호 적용).
       - 프로덕션 빌드 검증: `npm run build` 컴파일 성공 (경고 0건, 오류 0건).
     - **로컬 검증 실행 스크립트**:
       - `scripts/start_local_dev.ps1`: 로컬 DB(`127.0.0.1:5433 / overloaderdb_stepd_test`) 안전 비밀번호 입력 및 모의 OAuth(`USE_MOCK_OAUTH=true`) 환경 FastAPI 서버 실행 스크립트 (PowerShell AST 검증 통과).
   * **검증 범위 및 보안 제약 준수**:
     - 운영 Azure DB(`overloader.postgres.database.azure.com`) 절대 미접속.
     - 기존 프로덕션 `/auth/google` 엔드포인트 무변경 보존.
     - 외부 Google/Naver 라이브 네트워크 호출 없이 로컬 모의 환경으로 격리.
     - Git 커밋/푸시/병합/배포 미수행.

9. **로컬 OAuth 인가 버튼 404 원인 진단 및 해결 완료 (2026-11-06)**:
   * **원인 진단 (Root Cause)**:
     - `start_local_dev.ps1`이 `backend` 디렉터리로 이동하여 `uvicorn main:app`을 실행함에 따라 `sys.path[0]`이 `backend/`로 설정됨.
     - `backend/main.py` 내부의 `from backend.auth_router import create_auth_router`가 `ModuleNotFoundError: No module named 'backend'`를 발생시키고, `except Exception` 블록에서 경고만 출력한 뒤 조용히 무시되어 `auth_v2_router`가 FastAPI 앱에 마운트되지 않음.
     - 결과적으로 브라우저에서 버튼 클릭 시 `GET /auth/v2/oauth/{provider}/authorize` 요청이 FastAPI 기본 404(`{"detail":"Not Found"}`)를 반환함.
   * **수정 조치**:
     1. **Import 경로 정상화 (`backend/main.py`)**:
        - 파일 최상단에서 `sys.path`에 프로젝트 루트와 `backend/` 디렉터리를 모두 주입하여 실행 위치(루트 또는 `backend/`)와 무관하게 `backend.*` 및 일반 모듈 임포트가 모두 성공하도록 조치.
        - `backend/auth_router.py`, `backend/auth_service.py` 내부 임포트에 `try ... except ImportError:` 이중 안전 가드 적용.
        - 라우터 마운트 시 `try-except Exception` 예외 삼킴을 제거하여 라우터 생성 실패 시 즉시 에러가 표출되도록 개선.
     2. **운영 Azure DB 자동 fallback 방지 가드 (`backend/main.py`)**:
        - `DB_HOST` 환경변수가 누락된 비운영(local/dev) 환경에서 운영 Azure DB(`overloader.postgres.database.azure.com`)로 자동 연결되는 것을 차단하고 즉시 `RuntimeError`로 서버 시작을 중단하도록 방어 로직 추가.
     3. **Google OAuth 대기(pending) 상태 명확화**:
        - 네이버 개발자센터 설정만 등록된 현 단계에서 Real OAuth 모드 시 Google 인가 요청에 대해 조용히 mock으로 fallback하지 않고 `error=google_oauth_pending`으로 명확히 리다이렉트.
        - `AuthScreen.jsx` 및 `AccountManagementCard.jsx`에서 `google_oauth_pending` 감지 시 "구글 소셜 로그인은 연동 준비 중입니다. 현재는 네이버 로그인 및 일반 아이디/비밀번호 로그인을 지원합니다." 안내 메시지 표출.
     4. **종속성 패키지 동기화 (`backend/requirements.txt`)**:
        - Python 3.11 환경에 `pandas`, `scikit-learn`, `slowapi`, `matplotlib`, `python-telegram-bot` 설치 완료.
        - `tests/conftest.py` 추가를 통해 `sys.path` 경로를 테스트 환경에서도 자동 주입.
   * **검증 결과**:
     - `pytest tests/test_auth_utils.py tests/test_auth_router.py`: **61 passed, 1 warning (100% 통과, failures 0, errors 0, skipped 0)**.
     - 실 앱 라우트 마운트 검증: 총 59개 라우트 중 `/auth/v2` 14개 엔드포인트 정상 마운트 확인.
     - 기존 프로덕션 `/auth/google` POST 라우트 보존 확인.
     - TestClient 기반 실 라우트 인가 리다이렉트 검증:
       - Naver 인가 시작 (`GET /auth/v2/oauth/naver/authorize`): 307 Redirect -> `https://nid.naver.com/oauth2.0/authorize?response_type=code&...` 확인 완료.
       - Google 인가 시작 (`GET /auth/v2/oauth/google/authorize`): 307 Redirect -> `http://127.0.0.1:3000?error=google_oauth_pending` 확인 완료.
     - 루트 `.env` 명시적 로드 검증: Git 미추적(`.gitignore` 무시 목록 등록) 확인 완료, `override=False`를 통해 로컬 테스트 DB 환경변수 보존 확인, Naver 3대 환경변수(`NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `NAVER_CALLBACK_URL`) 설정 여부 확인(비밀값 미노출).
     - scripts/start_local_dev.ps1 인코딩 정상화: Windows PowerShell 5.1 호환을 위해 정상 한글 원문을 UTF-8 with BOM으로 저장, AST 구문 0 오류 및 PowerShell 출력 한글 무손상 검증 완료.

10. **로컬 127.0.0.1 단일 주소 체계 확정 및 프론트엔드 환경설정 (2026-11-06)**:
    * **주소 체계 통일 결정 및 검증 결과**:
      - 사용자 브라우저 확인 결과:
        - http://localhost:3000: 네이버 개발자센터 미등록 사이트 오류 발생.
        - http://127.0.0.1:3000: 실제 네이버 로그인 인가 화면 정상 진입 및 로그인 절차 진행 확인.
      - 정책 확정: 로컬 브라우저 및 백엔드 접속 주소는 127.0.0.1 기준으로 완전 단일화.
      - 임의 확장 금지: localhost 지원을 위해 네이버 개발자센터 설정이나 OAuth 허용 목록을 임의로 변경/확장하지 않음.
    * **프론트엔드 자동 열기 주소 반영**:
      - rontend/.env.development 생성 (Git 무시 목록에 포함):
        - HOST=127.0.0.1
        - REACT_APP_API_URL=http://127.0.0.1:8000
      - 효과: cd frontend; npm start 실행 시 브라우저가 자동으로 http://127.0.0.1:3000으로 열리도록 구성.
      - 실행 안내: scripts/start_local_dev.ps1의 브라우저 안내 주소(http://127.0.0.1:3000)와 완전 일치.

11. **메인 화면 복귀 직후 세션 만료(401) 원인 진단 및 해결 (2026-11-06)**:
    * **원인 추적 및 진단 (Root Cause)**:
      1. /auth/v2/oauth/exchange는 정상 성공하여 유효한 access JWT가 발급되고 localStorage 및 xios.defaults에 즉시 저장됨.
      2. 메인 대시보드 마운트 직후 GET /last-workout, GET /logs, GET /settings 등 보호 API가 올바른 Authorization: Bearer <token> 헤더를 포함하여 호출됨.
      3. 그러나 기존 ackend/main.py의 get_current_user는 jwt.decode(token, JWT_SECRET, algorithms=['HS256'])만 호출하고 udience를 전달하지 않았음.
      4. Step D 토큰에 ud='overloader-app' 클레임이 포함되어 있어, python-jose 디코더가 jose.exceptions.JWTClaimsError: Invalid audience 예외를 발생시키고 401 Unauthorized를 반환함.
      5. 프론트엔드 공통 인터셉터(rontend/src/auth.js)가 보호 API의 401 응답을 감지하여 performLogout({ expired: true })를 실행하고 '로그인이 만료되었어요. 다시 로그인해 주세요.' 경고창을 표시하며 토큰을 초기화함.
    * **수정 조치**:
      1. ackend/auth_utils.py의 decode_and_validate_access_token:
         - 토큰에 ud/iss가 포함되어 있을 경우 JWT_AUDIENCE('overloader-app') 및 JWT_ISSUER('overloader')를 정확히 대조 검증하도록 정상화. (위조/불일치 시 401 차단 유지).
      2. ackend/main.py의 get_current_user:
         - decode_and_validate_access_token을 활용하여 서명(HS256), 만료(exp), 대상(aud), 발급자(iss), 토큰 타입(type='access'), 토큰 버전(ver vs DB users.token_version) 전 항목을 엄격 검증하도록 개선.
         - 레거시 토큰(er/ud 미포함 기존 Google 로그인 토큰)도 하위 호환 검증 지원.
         - DB 일시 장애 발생 시 401이 아닌 503(인증 데이터베이스 일시 장애)을 반환하여 불필요한 자동 로그아웃 방지.
      3. 프론트엔드 API 주소 폴백 일원화:
         - App.js, HomeScreen.jsx, RecordScreen.jsx, SavedLogsAccordion.jsx, CalendarScreen.jsx, AnalyticsScreen.jsx, HealthScreen.jsx, SettingsScreen.jsx 전 화면에 process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000' 폴백 적용.

12. **사용자 브라우저 실검증 완료 내역 및 다음 작업 인계 사항 (2026-11-06)**:
    * **사용자 브라우저 직접 검증 완료 범위**:
      - 로컬 실제 네이버 OAuth 로그인 (http://127.0.0.1:3000 -> https://nid.naver.com/...) -> 백엔드 콜백 (/auth/v2/oauth/naver/callback) -> 일회용 교환 코드 발급 및 전달 -> 프론트엔드 코드 교환 (/auth/v2/oauth/exchange) -> JWT 저장 -> **메인 대시보드 정상 로드 및 보호 API 데이터 표시까지 브라우저에서 직접 정상 동작 확인 완료**.
      - 원인이었던 새 JWT udience와 기존 보호 API 디코더 간 불일치가 인증 통합 수정 후 완벽히 해소됨을 확인.
    * **테스트 실행 기록 (엄격 구분)**:
      - 단위 및 통합 테스트: **66 passed, 8 skipped (100% 통과)**.
      - **구분 명시**: 앞서 사용자가 격리 DB(overloaderdb_stepd_test)에서 직접 실행하여 통과한 8개 PostgreSQL 동시성 테스트(
un_step_d_local_tests.ps1 -TestOnly)와, 이번 단위/통합 테스트에서 실 DB 미연결로 자동 스킵된 8건(	ests/test_pg_concurrency.py)은 서로 명확히 구분됨.
      - **표현 주의**: 브라우저 자동화 도구(Selenium/Playwright 등)를 통한 자동 E2E가 아니므로, TestClient 기반 백엔드 API 통합 테스트와 사용자 수동 브라우저 검증을 명확히 구분하여 기록.
    * **미검증 및 미완료 항목 (확대 금지)**:
      - 실제 Google 새 OAuth 인가코드 흐름: Google Cloud Console 등록 준비 상태로 보류 중.
      - 브라우저 상의 전체 계정 관리 UI 기능(비밀번호 추가/변경/소셜 해제): 사용자 브라우저 수동 검증 대기.
      - 운영 Step D 배포: 운영 Azure DB 및 프로덕션 환경(https://app.overloader.cloud)에는 일체 미적용 상태 유지.
    * **다음 작업 시 주의사항 및 검토 과제 (당일 추가 리팩터링 금지 준수)**:
      1. **레거시 JWT 허용 정책 검토**:
         - 본래 새 인증 전환 계획은 er 없는 레거시 JWT를 거부하는 방향이었으나, 기존 서비스 연속성을 위해 레거시 토큰을 수용하도록 처리되었음.
         - 다음 작업에서 레거시 토큰 허용 범위, 지원 종료 조건(Sunset 일정), 그리고 	oken_version 무효화 우회 가능성(레거시 토큰 위조 방지 등)을 심층 검토해야 함. (당일 추가 인증 정책 변경이나 리팩터링은 진행하지 않음).
      2. **운영 DB 스키마 및 마이그레이션**:
         - 현재 운영 DB(overloaderdb)에는 Step C(테이블 구조 및 Google 계정 백필)까지만 영구 적용된 상태임.
         - 향후 Step D 백엔드 코드를 운영에 배포하기 전에 추가 스키마 점검, 환경변수 설정, 전환 절차를 사전 승인받은 뒤 단계별로 진행해야 함.
      3. **프론트엔드 환경변수 및 빌드**:
         - 로컬 개발 환경 기본 API 주소(http://127.0.0.1:8000)와 프로덕션 빌드 환경변수(https://api.overloader.cloud)의 분리 상태를 배포 전 재확인할 것.

13. **네이버 로그인 회귀 검증 및 홈페이지 로그인 수단 표시 불일치 해결 (2026-11-11)**:
    * **회귀 결과 및 사용자 브라우저 확인 완료**:
      - 사용자 브라우저 직접 확인: 실제 네이버 로그인 후 메인 대시보드 정상 표시, 세션 만료 경고 미발생 정상 동작 확인.
      - 발견된 문제: 메인 대시보드 사이드바에 로그인 수단이 "Google 계정"으로 오표시됨.
      - 최소 수정 적용 후 사용자 브라우저 직접 확인: 사이드바에 중립적 사실 기반 문구인 **"소셜 계정"**으로 정상 표시되는 것까지 브라우저 확인 완료.
    * **원인 추적 (Root Cause)**:
      - `frontend/src/components/layout/AppShell.jsx`의 데스크톱 좌측 사이드바 계정 카드에 `<div style={{ fontSize: 11, color: "var(--sub)" }}>Google 계정</div>` 문구가 리디자인 당시부터 고정 문자열(하드코딩)로 작성되어 있었음.
      - 설정 화면(`AccountManagementCard.jsx`)은 `/auth/v2/account/methods` API를 통해 실제 연동된 `social_accounts`를 동적으로 조회하므로 "소셜 로그인 전용 계정", "네이버 계정 연동됨(이메일 표시)"으로 정확히 표시되었으나, 홈 화면 사이드바는 하드코딩된 문구로 인해 불일치 발생.
      - 세션 JWT나 `localStorage`에는 로그인 당시의 프로바이더 정보가 포함되지 않으며, 사용자 식별자나 이메일로 프로바이더를 추정하는 코드는 존재하지 않음.
    * **최소 수정 내용**:
      - `AppShell.jsx`: 고정 "Google 계정"을 `accountLabel || "소셜 계정"`으로 교체 (중립적 사실 기반 문구 적용).
      - `App.js`: `AppShell`에 `accountLabel={user?.username ? `@${user.username}` : "소셜 계정"}` 전달.
    * **검증 현황**:
      - 단위/통합 테스트: 실행된 66건 통과, 8건 미실행 (`pytest`).
      - 프론트엔드 프로덕션 빌드: `npm run build` 성공 (`Compiled successfully`).
    * **미완료 및 제약 준수**:
      - 운영 Azure DB 미접속 및 변경 없음, 계정 연동 해제 미실행, Google OAuth 신규 구현/원격 push/배포 미실행.

14. **Google 실제 OAuth 인가코드 플로우 로컬 백엔드 구현 및 브라우저 검증 완료 (2026-11-11)**:
    * **사용자 브라우저 직접 확인 완료**:
      - 실제 Google 로그인 후 앱에 정상 진입하며 사이드바에 "소셜 계정"으로 정상 표시되는 것을 브라우저에서 직접 확인 완료.
      - 앞서 확인된 Naver 로그인 후 메인 정상 표시 및 로그인 만료 경고 없음 사실 유지.
      - ※ API별 200 응답은 사용자 확인으로 추정하지 않으며, 백엔드 로컬 터미널 로그로 관찰된 인가 엔드포인트(/auth/v2/oauth/google/authorize) 및 콜백(/auth/v2/oauth/google/callback) 진입 사실만 명시함.
    * **구현 내용**:
      - `backend/auth_router.py`: Google 인가 URL 생성(OIDC `openid email profile`, `prompt=select_account`, `nonce` 생성 포함) 및 콜백 수신 엔드포인트 구현.
      - OIDC 표준 검증: `google.oauth2.id_token.verify_oauth2_token`을 활용한 서명/발급자/대상(aud)/만료(exp) 검증, `nonce` 대조, OIDC UserInfo 엔드포인트(`https://openidconnect.googleapis.com/v1/userinfo`) `sub` 일치 검증 적용.
      - 식별자 및 계정 격리: Google의 `sub`를 `provider_user_id`로 사용하여 `social_accounts` 테이블에서 1:1 매핑 유지. 동일 이메일 타 제공자 계정과의 자동 병합 차단.
      - 보안 처리: 상태(`state`) 1회성 소진 및 만료 검증, 교차 제공자 state 주입 차단(`provider_mismatch`), Google 통신 타임아웃(10초) 및 오류 시 트랜잭션 롤백 보장.
    * **검증 현황 (3개 검증 유형 엄격 구분)**:
      1. **모의 단위/통합 테스트**: **74 passed, 8 skipped, 0 failed (100% 통과)** (`pytest`).
         - 추가된 8개 Google 단위 테스트: 인가 URL 파라미터 검증, 기존 Google 매핑 유지 검증(동일 users.id 유지 확인), 신규 Google 계정 분리, state 거부 시나리오(누락/만료/재사용/제공자 불일치), ID 토큰 검증 실패 거부, UserInfo sub 불일치 거부, 동의 거절 및 외부 통신 오류 처리, link 충돌 및 reauth 불일치 거부.
      2. **사용자 수동 브라우저 확인**:
         - 네이버 실제 로그인: 메인 대시보드 정상 진입, 세션 만료 경고 미발생 확인 완료.
         - Google 실제 로그인: 앱 정상 진입, 사이드바 "소셜 계정" 정상 표시 확인 완료.
      3. **실제 DB 테스트**:
         - 로컬 사용자 격리 DB(`127.0.0.1:5433 / overloaderdb_stepd_test`)에서 실행 확인된 사항이며, 운영 Azure DB에 대한 검증이 아님을 명시.
    * **미완료 및 제약 준수**:
      - 계정 관리 UI 수동 기능 검증(비밀번호 등록/변경, 소셜 연동/해제) 미실행 상태 유지.
      - 운영 Azure DB 미접속 및 스키마 변경 없음.
      - 레거시 인증 경로(`/auth/google`) 보존 유지.
      - 원격 push / merge / 배포 미실행.

15. **소셜 본인 인증 및 계정 연동 인가 URL 안전 시작 구조 개선 (2026-11-11)**:
    * **오류 원인 (Root Cause)**:
      - `AccountManagementCard.jsx`에서 `window.location.href = /auth/v2/oauth/{provider}/authorize?...`로 브라우저 상단 페이지를 직접 이동시킴.
      - 브라우저 직접 페이지 이동 시에는 Axios의 `Authorization: Bearer <token>` 헤더가 전송되지 않아 백엔드가 `401 Unauthorized ("재인증을 위해 로그인이 필요합니다.")`를 반환함.
      - 또한 URL 쿼리 파라미터에 JWT를 노출하는 것은 브라우저 히스토리, 서버 접근 로그, Referer 헤더에 토큰이 누출되는 보안 안티패턴임.
    * **안전한 구조 개선**:
      1. **백엔드**: `POST /auth/v2/oauth/{provider}/authorize-url` 엔드포인트 신설.
         - `Authorization: Bearer <token>` 헤더로 `current_user` 검증 (`Depends(get_current_user_v2)`).
         - 사용자 ID, 세션 ID, 목적(`reauth`/`link`), 타겟 작업(`password_add` 등)을 DB `auth_single_use_tokens`의 `state`에 안전하게 바인딩.
         - 검증된 공식 제공자 인가 URL(`https://nid.naver.com/...` 또는 `https://accounts.google.com/...`)을 JSON으로 반환. URL 내 JWT 노출 전면 제거.
      2. **프론트엔드**:
         - Bearer 헤더를 포함한 Axios 요청으로 `authorize-url`을 호출하고 반환된 인가 URL 호스트를 검증한 후 브라우저 이동.
         - 안전한 2단계 비밀번호 등록 흐름:
           - 1단계: 소셜 본인 인증 전에는 비밀번호를 입력받지 않고 `[소셜 본인 인증 시작]` 버튼으로 인증 유도. (페이지 이동 중 비밀번호 유실 및 스토리지 보관 위험 원천 차단).
           - 2단계: 소셜 인증 복귀 후 발급된 `ticket`(`purpose=password_add`)을 감지하여 모달을 띄우고, 사용자가 아이디/비밀번호 입력 후 `POST /auth/v2/account/password/add`로 원자적 티켓 소비 및 등록 완료.
      3. **쿼리 파라미터 구분자 정리**:
         - 콜백 리다이렉트 시 `target_redirect` 내 쿼리 파라미터(`?tab=settings`) 존재 여부에 따라 `&`와 `?`를 안전하게 자동 분기 처리.
    * **검증 현황**:
      - 단위/통합 테스트: **78 passed, 8 skipped, 0 failed (100% 통과)** (`pytest`).
      - 프론트엔드 빌드: `npm run build` 성공 (`Compiled successfully`).

16. **네이버 재인증 규격 반영 및 OAuth 콜백 복귀 시 설정 탭/티켓 보존 개선 (2026-11-11)**:
    * **오류 원인 (Root Cause)**:
      1. **네이버 재인증 파라미터 누락**: `purpose=reauth` 시 네이버 공식 재인증 파라미터인 `auth_type=reauthenticate`가 인가 URL에 누락되어 네이버 계정 비밀번호 재확인 절차가 생략됨.
      2. **목적 및 리다이렉트 유실**: 외부 OAuth 제공자(Naver)는 인가 후 서버 콜백 엔드포인트 호출 시 원본 프론트엔드 쿼리나 `target_purpose`를 전달하지 않음. DB state에 `target_purpose`가 저장되지 않아 콜백 처리 시 `reauth_purpose`가 `password_reset`으로 폴백되고, 리다이렉트 대상이 `http://127.0.0.1:3000`(루트)으로 폴백됨.
      3. **프론트엔드 URL 정리 타이밍 간섭**: 백엔드가 `purpose=password_reset`으로 리다이렉트하고 `App.js`에서 로그인 사용자 초기화가 비동기로 지연되는 사이, `AuthScreen`이 첫 렌더 프레임에 마운트되어 URL 쿼리스트링 전체를 `replaceState`로 제거해버림.
    * **안전한 구조 개선**:
      1. **백엔드 인가 URL에 네이버 규격 반영**: `POST /auth/v2/oauth/{provider}/authorize-url` 및 `GET /oauth/{provider}/authorize`에서 `provider == 'naver'`이고 `purpose == 'reauth'`일 때 `auth_type=reauthenticate`를 추가.
      2. **DB state에 전체 목적(`reauth:password_add`) 원자적 보존**: `auth_single_use_tokens`의 `purpose` 컬럼에 `reauth:password_add` 형식으로 타겟 목적을 보존하고, 콜백 시 이를 파싱하여 `reauth_purpose=password_add`로 정확히 복원.
      3. **콜백 리다이렉트 경로 지능형 보장**: `redirect_uri`가 생략된 경우에도 `reauth:password_add` 및 `link`의 기본 복귀 경로를 `http://127.0.0.1:3000?tab=settings`로 자동 설정.
      4. **프론트엔드 동기 초기화 및 설정 탭 자동 복귀**:
         - `App.js`에서 `user` 상태를 `localStorage`로부터 동기 지연 없이 즉시 초기화하여, 로그인 복귀 시 `AuthScreen`이 일시 마운트되거나 쿼리를 소거하지 않도록 방지.
         - `App.js`의 `tab` 상태 초기화 시 `tab=settings`, `purpose=password_add`, 또는 재인증 `ticket` 수신 시 자동으로 `settings` 탭을 선택하여 `AccountManagementCard`가 즉시 마운트되도록 보장.
      5. **모달 및 티켓 안전 처리**: `AccountManagementCard`가 `ticket`과 `purpose=password_add`를 감지하면 등록 모달을 열고, 브라우저 주소창에서 티켓 쿼리를 안전하게 정리 (`window.history.replaceState`). 비밀번호는 스토리지나 URL에 일체 노출되지 않음.
    * **검증 현황**:
      - 단위/통합 테스트: **79 passed, 8 skipped, 0 failed (100% 통과)** (`pytest`).
      - 프론트엔드 빌드: `npm run build` 성공 (`Compiled successfully`).
      - 사용자 브라우저 수동 확인 완료: 네이버 본인 재인증 -> 아이디/비밀번호 등록 성공, 로그아웃 후 등록한 아이디/비밀번호로 로그인 성공, 기존 운동 기록 등 데이터 정상 표시 확인 완료.

17. **앱 공통 프로필과 로그인 수단 분리 및 사용자 정보 응답 통일 (2026-11-11)**:
    * **원인 추적 (Root Cause)**:
      1. **응답 구조 불일치**:
         - `/auth/v2/oauth/exchange`: 최상위 필드로 `{ token, name, user_id, token_version }`을 반환하였으나, 등록된 `username`을 DB에서 조회하여 포함하지 않음.
         - `/auth/v2/login` 및 `/auth/v2/register`: `{ token, user: { id, name, username } }` 형태로 중첩 객체를 반환하여 최상위 `name`, `username`이 누락됨.
         - `AuthScreen.jsx`와 `App.js`의 `handleLogin`이 `res.data.name`을 직접 참조하여, 비밀번호 로그인 시 `name`이 `undefined`로 평가되어 `AppShell`의 `userName || "사용자"`로 폴백됨.
      2. **사용자 정보 정기 동기화 부재**:
         - `App.js`가 마운트 또는 새로고침 시 `/auth/v2/me`를 호출하여 표준 프로필을 가져오지 않고 `localStorage`의 문자열에만 의존하여, 새로고침 시 `username`이 유실되어 `@아이디` 대신 "소셜 계정"으로 오표시됨.
      3. **계정 동일성 확인**:
         - 소셜 로그인과 비밀번호 로그인은 동일한 DB `users.id`를 공유하며, `password_credentials`와 `social_accounts`가 동일 `user_id` 외래키로 올바르게 1:1/1:N 관계를 유지함을 확인.
    * **앱 공통 닉네임 및 사용자 정보 개선 내역**:
      1. **인증 응답 구조 통일**:
         - `/auth/v2/login`, `/auth/v2/register`, `/auth/v2/oauth/exchange`, `/auth/v2/me` 전체에서 최상위 및 `user` 객체 양쪽에 `{ id, user_id, name, username, token_version }`을 동일하게 반환하도록 통일.
         - `oauth/exchange`에서도 해당 사용자의 `password_credentials`를 조회하여 등록된 `username`이 있으면 즉시 반환.
      2. **공통 닉네임 정책 준수 (users.name 1~50자)**:
         - 신규 컬럼을 추가하지 않고 기존 `users.name`을 공통 닉네임으로 활용.
         - 최초 소셜 계정 생성 시에만 소셜 프로필명을 초기 닉네임으로 사용하고, 이후 로그인/재인증/연동 시 기존 닉네임을 절대 덮어쓰지 않음.
         - 아이디/비밀번호 추가 시에도 기존 닉네임을 변경하지 않음.
      3. **프론트엔드 프로필 동기화 수렴**:
         - `App.js`에서 토큰 존재 시 `/auth/v2/me`를 호출하여 표준 사용자 정보를 비동기 수렴.
         - 설정 탭에서 비밀번호 등록/해제 시 `onProfileUpdate` 콜백을 통해 즉시 `/auth/v2/me`를 재조회하여 사이드바와 설정 화면이 새로고침 없이 즉시 동기화.
         - 사용자 로그아웃 또는 401 만료 중 응답이 도착해도 세션이 부활하지 않도록 `token` 존재 여부 가드 추가.
      4. **UI 표시 분리**:
         - 사이드바 첫 줄: DB 공통 닉네임 (`user.name`).
         - 사이드바 두 번째 줄: `user.username`이 있으면 `@아이디`, 없으면 `Overloader 계정` (로그인 수단에 따른 분기 제거).
         - 구글/네이버/비밀번호 연동 여부는 설정 탭의 "로그인 수단 관리" 섹션에서 독립적으로 표시.
      5. **닉네임 변경 UI 확인 결과**:
         - 현재 별도의 닉네임 수정 UI/엔드포인트는 존재하지 않으며, 필요 시 추가 범위(예: `PATCH /auth/v2/me` 1~50자 닉네임 수정 API 및 설정 모달 UI)를 제안함.
    * **검증 현황**:
      - 백엔드 단위/통합 테스트: **81 passed, 8 skipped, 0 failed** (`pytest`, 스킵된 8건은 로컬 전용 PostgreSQL 컨테이너 통합 테스트이며 미검증 상태로 정확히 구분).
        * 동일 user_id에 대해 비밀번호 로그인, OAuth 교환, GET /me 응답의 name/username 완전 일치 검증 추가.
        * 소셜 이름 변경 시에도 기존 앱 닉네임 보존 검증 추가.
      - 프론트엔드 테스트: **7 passed, 0 failed** (`react-scripts test`).
      - 프론트엔드 빌드: `npm run build` 컴파일 성공 (`Compiled successfully`).
      - 사용자 브라우저 수동 확인 완료 (2026-11-12):
        * 네이버 로그인: 공통 닉네임 / @아이디 정상 표시 확인.
        * 네이버 로그인 후 새로고침: 동일 표시 유지 확인.
        * 로그아웃 후 아이디/비밀번호 로그인: 동일 표시 확인.
        * 비밀번호 로그인 후 새로고침: 동일 표시 유지 확인.
        * 설정 화면과 사이드바의 닉네임 및 아이디 일치 확인.
        * 기존 운동 기록 정상 표시 확인.
        * (API별 HTTP 상태 코드는 브라우저 UI 직접 검증 범위에 한정하여 추정치 없이 미기록)

18. **비밀번호 변경 브라우저 수동 검증 완료 (2026-11-12)**:
    * **사용자 브라우저 수동 확인 내역**:
      - 비밀번호 변경 성공 안내 문구 표시 확인.
      - 변경 직후 로그아웃되지 않고 현재 세션 정상 유지 확인.
      - 사이드바 닉네임 / @아이디 및 기존 운동 기록 정상 유지 확인.
      - 로그아웃 후 이전(변경 전) 비밀번호 로그인 거부 확인.
      - 새 비밀번호 로그인 성공 확인.
      - 새 비밀번호 재로그인 후에도 동일 프로필 및 기존 운동 기록 정상 유지 확인.
      - (사용자가 직접 확인한 화면 결과만 기록하며, API 상태 코드나 타 세션 무효화 여부 등은 추정치 없이 미기록)

19. **Google 소셜 계정 연동 성공 확인 및 연결 충돌/해제 재인증 티켓 오류 수정 (2026-11-12)**:
    * **사용자 브라우저 수동 확인 내역 (정상 동작)**:
      - 네이버 및 아이디/비밀번호 로그인과 새로고침 시 공통 프로필(닉네임 / @아이디) 일관성 확인 완료.
      - 비밀번호 변경 성공 후 로그아웃 없이 현재 세션 및 기존 운동 기록 유지 확인 완료.
      - 로그아웃 후 이전 비밀번호 로그인 거부, 새 비밀번호 로그인 성공 확인 완료.
      - 신규 Google 계정 연결 성공 확인 완료.
      - 연결한 Google로 로그인했을 때 기존 닉네임·아이디·운동 기록 유지 확인 완료.
      - 설정 화면에 로그인 수단 3개(Google + 네이버 + 비밀번호) 표시 및 새로고침(F5) 후 유지 확인 완료.
      - 로컬 DB 비밀번호 인증 실패 후 백엔드 복구 및 앱 정상 동작 확인 완료.
      - Google 연동 해제 및 동일 계정 재연결 10단계 브라우저 수동 검증 완료 (2026-11-12):
        * 현재 비밀번호로 로그인.
        * 설정에서 Google 연동 해제 진행: 현재 비밀번호 재인증 통과 후 해제 성공.
        * 성공 안내 메시지 및 Google 행 '미연동' 표시 확인.
        * 네이버 + 비밀번호 총 2개 연동 상태 유지 확인.
        * 사이드바 닉네임·아이디 및 기존 운동 기록 온전 유지 확인.
        * 새로고침(F5) 후에도 2개 연동 및 미연동 상태 유지 확인.
        * 설정 화면에서 [Google 연동] 버튼으로 동일 Google 계정 재연결 성공.
        * 성공 안내 및 총 3개 연동 복원 확인.
        * 로그아웃 후 재연결한 Google 계정으로 로그인 성공.
        * 동일 닉네임·아이디 프로필과 기존 운동 기록 온전 유지 확인.
        * (API별 HTTP 상태 코드 및 타 세션 무효화 여부 등은 추정치 없이 미기록)
      - 마지막 로그인 수단 보호 브라우저 확인 결과 (2026-11-12):
        * Google 단독 계정: Google 연동 해제 버튼이 비활성화(`disabled`, 불투명도 0.4, `not-allowed`)되어 클릭 차단됨을 사용자 확인 완료.
        * Google 단독 계정: 해당 항목 아래에 `"마지막 로그인 수단은 해제할 수 없습니다. 다른 로그인 수단을 먼저 추가해 주세요."` 도움말이 상시 정상 표시됨을 사용자 확인 완료.
        * 호버 툴팁: 이번 수동 검증에서는 별도로 재확인하지 않음.
        * 네이버 단독 및 비밀번호 단독 계정: 사용자 브라우저 미검증 상태 유지.
        * 백엔드 직접 요청 차단: 이번 수동 검증 범위가 아니며 단위 테스트 검증 완료 상태 유지 (사용자 확인으로 확대하지 않음).
        * 2개 이상 연결된 계정에서 도움말이 숨겨지는지: 사용자 재확인 전 상태 유지.
        * (계정 이메일 등 개인 식별 정보는 미기록)
      - 기존 계정 연결 충돌 배너: `already_linked_to_other_user` 충돌 시 상단 에러 배너 정상 표시 사용자 확인 완료 (2026-11-12).
    * **사용자 발견 오류 1 (기존 Google 계정 연결 충돌 안내 누락)**:
      - 현상: 별도 계정으로 기사용 중이던 Google 계정 연동 시도 시, 충돌 차단은 정상 수행되었으나 화면에 오류 안내 문구가 노출되지 않고 증발함 (충돌 차단 완료가 아닌 "연결 미반영 및 안내 누락"으로 기록).
      - 원인: OAuth 콜백 후 프론트엔드로 `?tab=settings&error=already_linked_to_other_user` 쿼리가 전달되었으나, `AccountManagementCard.jsx`가 해당 오류를 모달 내부 에러 상태(`modalError`)에만 할당함. 당시 화면에 열려 있는 모달이 없어 사용자에게 오류가 보이지 않은 채 `replaceState`로 URL 쿼리만 소거됨.
      - 개선: `AccountManagementCard.jsx`에 카드 전역 에러 배너(`cardError`)를 신설하여 `{cardError && <div style={styles.alertError}>⚠️ {cardError}</div>}`로 모달 외부에서도 즉시 표시되도록 개선. `already_linked_to_other_user`에 대해 "해당 소셜 계정은 이미 다른 사용자의 계정에 연동되어 있습니다. 다른 소셜 계정을 연동하거나 기존 계정으로 로그인해 주세요."라는 명확한 한국어 안내 제공. `App.js`에서도 에러 파라미터 수신 시 `tab=settings`로 안정 유지되도록 가드 보강.
    * **사용자 발견 오류 2 (소셜 연동 해제 시 재인증 티켓 target_provider 불일치 오류)**:
      - 현상: Google 연동 해제 시 현재 비밀번호를 입력하고 진행했을 때 `유효하지 않은 재인증 티켓입니다: Reauth ticket target provider mismatch: ticket is for 'None', expected 'google'` 오류 발생하며 실패 (취소 확인이 아닌 "해제 요청 중 재인증 티켓 불일치로 실패"로 기록).
      - 원인: 프론트엔드 `AccountManagementCard.jsx`에서 비밀번호 재인증 호출(`POST /auth/v2/reauth/password`) 시 `target_provider`를 전달하지 않았고, 백엔드 `ReauthPasswordRequest` 모델 및 `reauth_password` 엔드포인트도 `target_provider` 파라미터를 수신·저장하지 않아 `target_provider=None`으로 티켓이 발급됨. 이후 `POST /auth/v2/account/social/unlink`에서 `expected_target_provider='google'`과 대조 시 불일치로 거부됨.
      - 개선:
        1. 백엔드 `ReauthPasswordRequest`에 `target_provider: Optional[str] = None` 추가.
        2. `reauth_password`에서 `purpose == "social_unlink"`일 때 `target_provider` 필수 검증 (`google` 또는 `naver`), 티켓 클레임 및 DB 일회용 토큰 저장소에 `target_provider` 안전 바인딩.
        3. `unlink_social`에서 `TokenValidationError` 발생 시 내부 영문 예외 대신 "해제 대상 소셜 계정과 일치하지 않는 재인증 티켓입니다." 등 직관적인 한국어 에러 메시지로 매핑.
        4. 프론트엔드 `AccountManagementCard.jsx`의 `executeUnlink`에서 `reauth/password` 호출 시 `target_provider: prov`를 정확히 전송.
        5. 실패 시 트랜잭션 롤백으로 인해 실제 DB `social_accounts` 데이터는 일체 손상·삭제되지 않고 안전하게 보존됨을 확인.
    * **로컬 DB 연결 실패(UnicodeDecodeError) 분석 및 main.py 보강**:
      - 현상: 백엔드 시작 시 `backend/main.py:199 db_pool = pool.SimpleConnectionPool(...)`에서 `UnicodeDecodeError: 'utf-8' codec can't decode byte 0xb8 in position 57: invalid start byte` 발생하며 중단.
      - 원인 분석: PostgreSQL 서버 로그(`postgresql-2026-11-08_000000.log` 10:12:57) 확인 결과 실제 원인은 `치명적오류: 사용자 "postgres"의 password 인증을 실패했습니다`였음. PostgreSQL 서버가 윈도우 한국어 로케일(CP949)로 오류를 전송했으나 `psycopg2`가 UTF-8로 디코딩을 시도하면서 발생한 파생 오류임.
      - 개선: `backend/main.py`에서 `UnicodeDecodeError` 발생 시 특정 원인(비밀번호 등)으로 단정하지 않고, 일반 연결 실패(비밀번호 불일치, DB 미존재, 포트 접근 거부 등) 가능성을 명시하며 안전한 진단 정보(호스트, 포트, DB명, 사용자 - 비밀값 일체 없음)와 함께 서버 로그 확인을 안내하도록 예외 처리를 보강함. 인증 실패를 은폐하거나 운영 DB로 폴백하지 않음.
    * **검증 현황**:
      - 백엔드 단위/통합 테스트: **86 passed, 8 skipped, 0 failed** (`pytest`, 신규 5개 단위 테스트 추가. PostgreSQL 동시성 8건은 최신 코드에서 미실행 상태 유지).
      - 프론트엔드 테스트: **7 passed, 0 failed** (`react-scripts test`).
      - 프론트엔드 빌드: `npm run build` 컴파일 성공 (`Compiled successfully`).
      - 제약 준수: 원격 push / merge / 운영 배포 미실행, 사용자 정상 연결 계정 임의 변경 없음.

20. **레거시 JWT 즉시 거부 정책(대안 A) 적용 및 브라우저 수동 검증 완료 (2026-11-12)**:
    * **정책 결정 및 배경**:
      - 기존에 `backend/main.py`의 `get_current_user`에서 `allow_legacy_no_version=True`로 인해 `ver` 클레임이 없는 구형 레거시 토큰이 일반 API(`/last-workout`, `/logs`, `/settings` 등)에서 허용되고 있었음.
      - 이로 인해 비밀번호 변경으로 `users.token_version`이 증가해도 구형 토큰의 세션 무효화가 우회되는 보안 위험이 존재함.
      - 모든 보호 API에서 동일한 JWT 검증 기준을 적용하고 세션 무효화를 보장하기 위해 레거시 토큰을 일반 API에서도 즉시 거부하는 '대안 A'를 적용함.
    * **구현 변경 내역**:
      - `backend/main.py`: `get_current_user`에서 `allow_legacy_no_version=False`로 변경. `ver`, `aud`, `iss`, `type`이 없는 토큰은 일반 API에서도 즉시 401 반환. DB 조회 시 미존재 사용자에 대해 명시적 401 반환. `backend.auth_utils` 싱글톤 임포트 우선순위 정렬.
      - `backend/auth_utils.py`: `allow_legacy_no_version=False` 시 `ver` 클레임 누락에 대해 호출 인자(`expected_token_version`) 전달 여부와 무관하게 즉시 `TokenVersionMismatchError`를 발생시켜 일관되게 401로 차단.
      - `tests/test_auth_integration_protected_apis.py`: 기존 레거시 허용 테스트를 401 거부 기대값으로 갱신하고, 신규 5종 회귀 테스트 케이스 추가 (총 10건 통과).
    * **사용자 브라우저 수동 검증 내역**:
      - 무효 토큰 설정 후 새로고침 시 401 처리로 “로그인이 만료되었어요. 다시 로그인해 주세요.” 안내 표시 확인.
      - 로그인 화면(`AuthScreen`)으로 정상 전환 확인.
      - 재로그인 후 대시보드·운동 기록 정상 표시 및 새로고침(F5) 세션 유지 확인.
      - Google·네이버·비밀번호 총 3개 연동 및 기존 운동 데이터 유지 확인.
      - *(검증 범위 한정: 실제 서명된 ver 없는 레거시 토큰을 브라우저에 직접 주입한 것은 아니며, 브라우저에서 확인한 것은 401 응답 이후 세션 정리·만료 안내·재로그인 흐름임. ver 없는 유효 서명 레거시 토큰의 401 차단은 백엔드 회귀 테스트로 검증됨)*
      - *(개인 이메일·아이디 등 식별 정보는 미기록)*
    * **테스트 검증 결과**:
      - PostgreSQL 동시성 테스트 8건 전부 통과, 스킵 0건 (8 passed, 0 failed, 0 skipped).
      - 백엔드 인증·통합 테스트 91건 전부 통과, 실패·스킵 0건 (91 passed, 0 failed, 0 skipped).
      - 프론트엔드 테스트 및 빌드 정상 유지.

21. **향후 잔여 작업 (Next Steps)**:
    - 2개 이상 연결된 계정에서 마지막 수단 도움말이 숨겨지는지 및 네이버/비밀번호 단독 계정 UI 재확인.
    - `auth.js`의 세션 불일치 시 영구 대기 Promise 정책 검토.
    - 운영 Azure DB Step D 스키마 마이그레이션 및 프로덕션 환경변수 배포 계획 수립.
