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
   * **검증 상태 구분 (엄격 분리)**:
     1. [검증 완료] **사용자 브라우저 UI 육안 확인**: 기록 탭 다크 테마 입력창 룩앤필(배경/테두리/반경/포커스), 날짜 피커 달력 아이콘 시인성, '작성 중인 세트' 제목 및 보조 캡션, 서버 기록 카드 분리 정상 확인 및 사용자 승인 완료.
     2. [검증 완료] **빌드 및 시뮬레이션 테스트 통과**:
        - 프론트엔드 빌드(`npm run build`) 경고 및 에러 0건 성공 (`Compiled successfully`, gzip 225.26 kB).
        - 백엔드 날짜 검증(`validate_workout_date`) KST 기준 유효 달력/미래 차단 직접 단위 테스트 100% 통과.
        - 로컬 스토리지 사용자/날짜별 격리, 14일 updatedAt TTL 만료, UNKNOWN 상태 전이 격리 독립 시뮬레이션 100% 통과.
     3. [미검증 유지] **통합/실서버 환경 미검증 항목**:
        - 실제 PostgreSQL 운영 DB에 날짜별로 레코드가 인서트되는 통합 데이터 검증 (DB 변경/테스트 격리 준수를 위해 미실행).
        - 과거 날짜 기록 저장 시 텔레그램/Discord 실제 외부 웹훅 알림 발송 검증 (라이브 알림 미발송 준수를 위해 미실행).
        - 브라우저 실환경에서 며칠에 걸친 실제 날짜 전환 및 다중 탭 동시 입력 실시간 복원 검증.
   * **서버 멱등성 미구현 및 UNKNOWN 처리 한계 명시**:
     - 현재 DB 및 API에는 `client_set_id` 컬럼이나 고유 제약조건, 서버 Idempotency Key 메커니즘이 구현되어 있지 않으므로 **서버 측 멱등성은 미구현** 상태입니다.
     - 네트워크 타임아웃 등으로 응답을 수신하지 못했을 때 클라이언트는 해당 세트를 `UNKNOWN` 상태로 전환하여 '클라이언트 측의 무분별한 자동 재전송'만을 안전하게 억제합니다.
     - 따라서 실제 서버에 데이터가 도달했는지 여부는 클라이언트가 독자적으로 확정할 수 없으며, 사용자가 상단 '이 날짜에 저장된 기록' 조회를 통해 직접 중복 여부를 대조해야 하는 구조적 한계가 존재합니다.
   * **현재 상태**: Step B 및 UI 회귀 수정 체크포인트 커밋 완료 대기.

