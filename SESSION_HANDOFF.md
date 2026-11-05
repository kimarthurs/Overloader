# Overloader UI 리디자인 세션 인계 문서 (SESSION_HANDOFF.md)

작성 일시: 2026-11-05 (로컬 시간)  
기준 브랜치: `feature/redesign-shell-home`  
현재 HEAD 커밋: `56d6681` (`feat: redesign health screen with 5 subtabs (body, cardio, meal, routine, ai)`)  
리디자인 시작 전 원본 기준 커밋: `e43fa5669793a4e18e59cf9bdcddd21c0d5a020b`  
원격 보존 브랜치: `backup/pre-redesign` 및 `feature/redesign-shell-home` (origin: `https://github.com/kimarthurs/Overloader.git`)

---

## A. 프로젝트와 작업 목적

1. **작업 개요**:
   * 기존 Overloader 웹 애플리케이션의 Google OAuth 인증, 백엔드 FastAPI, PostgreSQL DB 스키마, 비즈니스 계산식 및 API 계약을 100% 보존하면서, 외부 시안(Readdy 디자인)을 참고하여 프론트엔드 UI를 탭 단위로 순차 재구현하고 있습니다.
   * 외부 도구의 소스 코드 다운로드는 확보하지 못했으므로, 기존 React Create-React-App(CRA) 프로젝트 내부에서 직접 컴포넌트화하여 구현했습니다.
2. **실제 기술 스택 및 실행 환경**:
   * **Frontend**: React 19.2.6, `react-scripts` 5.0.1 (CRA), Axios 1.16.0, Recharts 3.8.1, Pure Inline SVG (외부 CDN 없음), CSS Variables Design Token System (`tokens.css`).
   * **Backend**: FastAPI (Python 3.10+), PostgreSQL (`overloaderdb`), Uvicorn.
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
3. **화면별 대응표**:
   * `1.png` / `1.pdf`: 홈 (`/`) — **승인 및 구현 완료** (`e599a57`)
   * `2.png` / `2.pdf`: 기록 > 근력 (`/record`) — **승인 및 구현 완료** (`988b433`)
   * `3.png` / `3.pdf`: 기록 > 유산소 (`/record`) — **승인 및 구현 완료** (`988b433`)
   * `4.png` / `4.pdf`: 달력 (`/calendar`) — **승인 및 구현 완료** (`5317734`)
   * `5.png` / `5.pdf`: 분석 > 볼륨 (`/analyze?tab=volume`) — **승인 및 구현 완료** (`e0e0106`)
   * `6.png` / `6.pdf`: 분석 > 1RM (`/analyze?tab=1rm`) — **승인 및 구현 완료** (`e0e0106`)
   * `7.png` / `7.pdf`: 분석 > 추세 (`/analyze?tab=trends`) — **승인 및 구현 완료** (`e0e0106`)
   * `8.png` / `8.pdf`: 분석 > 머신러닝 (`/analyze?tab=ml`) — **승인 및 구현 완료** (`e0e0106`)
   * `9.png` / `9.pdf`: 건강 > 바디 (`/health?tab=body`) — **승인 및 구현 완료** (`56d6681`)
   * `10.png` / `10.pdf`: 건강 > 유산소 통계 (`/health?tab=cardio`) — **승인 및 구현 완료** (`56d6681`)
   * `11.png` / `11.pdf`: 건강 > 식단 (`/health?tab=meal`) — **승인 및 구현 완료** (`56d6681`)
   * `12.png` / `12.pdf`: 건강 > 루틴 (`/health?tab=routine`) — **승인 및 구현 완료** (`56d6681`)
   * `13.png` / `13.pdf`: 건강 > AI 코칭 (`/health?tab=ai`) — **승인 및 구현 완료** (`56d6681`)
   * `14.png` / `14.pdf`: 설정 (`/settings`) — **진행 예정 (텔레그램/Discord 포함)**

---

## C. 사용자 승인 상태

1. **공통 앱 셸 + 홈 화면**: 브라우저 확인 후 **디자인 및 동작 승인 완료** (체크포인트: `e599a57`)
2. **기록(Record) 탭**: 브라우저 확인 후 **디자인 및 인터랙션 승인 완료** (체크포인트: `988b433`)
3. **달력(Calendar) 탭**: 브라우저 확인 후 **디자인 및 화면 배치 승인 완료** (체크포인트: `5317734`)
4. **분석(Analyze) 탭**: 브라우저 확인 후 **디자인 및 화면 구성 승인 완료** (체크포인트: `e0e0106`)
5. **건강(Health) 탭 5종**: 브라우저 확인 후 **디자인 및 화면 구성 승인 완료** (체크포인트: `56d6681`)
6. **후속 탭 상태 (설정)**:
   * **현재 리디자인 착수 단계**입니다.
   * 사용자의 명시적인 사전 승인 없이 임의로 승인 완료된 이전 화면 코드를 재설계하지 마십시오.

---

## D. 구현 파일과 핵심 연결

1. **핵심 구현 파일 목록**:
   * `frontend/src/components/layout/AppShell.jsx`:
     * 데스크톱 240px 좌측 사이드바, 모바일 56px 헤더, 모바일 60px 5탭 바 (`홈`, `기록`, `달력`, `분석`, `건강`).
     * 설정 진입: 모바일 헤더 우측 톱니바퀴 아이콘 및 PC 사이드바 설정 메뉴.
   * `frontend/src/components/home/HomeScreen.jsx`:
     * 상단 오늘 세트 히어로 카드, 이번 달 요약 타일 3종, 최근 운동 카드(`GET /last-workout`), 미니 캘린더(`GET /logs?month=`), 바로가기 카드.
     * props: `userName`, `onNavigateTab`, `showLastWorkout`.
   * `frontend/src/components/record/RecordScreen.jsx`:
     * 실시간 타이머(`00:00`), 세션 세트 수 배지, 근력/유산소 모드 전환.
     * 근력: 종목 자동완성(`GET /workout-names`), 빠른 칩, 중량/횟수 입력, `+ 세트 추가`, `↓ DROP`, 세션 세트 목록, 일괄 저장(`POST /record`), 최근 운동 목록(`GET /last-workout`).
     * 유산소: 프리셋 칩, 2열 입력, 실시간 요약 배지, 저장(`POST /cardio`).
   * `frontend/src/components/calendar/CalendarScreen.jsx`:
     * 42칸 고정 그리드(6주 고정), 이전/다음 달 이동, '오늘' 바로가기, 범례(근력 주황 / 유산소 초록 닷).
     * 월간 운동 날짜 조회(`GET /logs?month=`), 선택일 근력 내역(`GET /logs?date_str=`), 선택일 유산소 내역(`GET /cardio?date_str=`).
     * 개별 세트 삭제(`DELETE /logs/{id}`), 유산소 삭제(`DELETE /cardio/{id}`).
     * props: `onNavigateTab`.
   * `frontend/src/components/analyze/AnalyticsScreen.jsx`:
     * 볼륨 패널 (`VolumePanel`): 주차별/월별 볼륨 및 5세션/10세션/20세션 인터벌 비교.
     * 1RM 패널 (`OneRmPanel`): Top 1 대표 배너 및 종목별 추정 1RM 랭킹 테이블.
     * 추세 패널 (`TrendsPanel`): 카테고리 필터(전체/등/가슴/하체/어깨/팔/복근), 멀티라인 추이 및 종목별 상세 테이블.
     * 머신러닝 패널 (`MlPanel`): 모델 품질 경고($R^2 \ge 0.6$ 기준), 주간 성장률(kg 단위) 분석 및 추천.
   * `frontend/src/components/health/HealthScreen.jsx`:
     * 바디 패널 (`BodyPanel`): 체중/체지방/근육량 입력 및 저장(`POST /body`), 몸무게/근육량 및 체지방률 추이 라인차트, 기록 목록 테이블 및 삭제.
     * 유산소 패널 (`CardioPanel`): 종목별 요약 그리드(횟수, 총 시간, 총 거리), 운동 시간/거리 추이 반응형 라인차트(PC 2열, 모바일 1열), 전체 기록 테이블.
     * 식단 패널 (`MealPanel`): 오늘 식단 및 템플릿(기본 식단) 뷰 전환, 4개 매크로 블록 총합, 식사 분류(아침/점심/저녁/간식)별 목록 및 추가 폼, 템플릿 관리/적용 및 섭취량별 실시간 매크로 자동 계산 미리보기.
     * 루틴 패널 (`RoutinePanel`): 새 루틴 만들기(운동명 자동완성), 내 루틴 목록(HTML5/터치 드래그 순서 변경 `PUT /routines/reorder`), 운동 이력 뱃지/상세, 인라인 수정 모드(순서 이동, 운동 추가/삭제).
     * AI 패널 (`AiPanel`): 목표 수치 설정(체중/체지방/근육량/메모 `POST /goals`), 이전 추천 이력 포맷팅 표시, 수동 실행 보호된 AI 추천 버튼(`POST /ai/recommend`).
   * `frontend/src/components/common/Icons.jsx`:
     * 외부 CDN 없이 순수 인라인 SVG 컴포넌트 26종 내장.
   * `frontend/src/styles/tokens.css`:
     * 다크/라이트 CSS 테마 토큰, 그리드 레이아웃, 버튼, 인풋, 카드 스타일, 건강 화면 전용 클래스.
   * `frontend/src/App.js`:
     * 전체 세션 상태(`user`), 탭 전환(`tab`), `showLastWorkout` 설정 상태 유지.
2. **핵심 인터랙션 연결**:
   * **홈 최근 운동 표시 토글**: `SettingsTab`에서 `show_last_workout` 변경 시 `HomeScreen`의 최근 운동 섹션 노출 여부에 즉시 반영됨.
   * **홈 미니 달력에서 달력 탭 이동**: 홈의 미니 달력 클릭 시 `setTab("calendar")`를 호출하며, `CalendarScreen`은 오늘 날짜를 기본 선택하여 마운트됨.
   * **기록 저장 후 갱신**: 기록 저장 시 홈 화면 복귀 또는 달력 탭 이동 시 각 화면의 `useEffect`가 최신 `/logs` 및 `/last-workout` 데이터를 자동 갱신함.

---

## E. 반드시 보존할 기존 동작

1. **인증 및 세션 처리**:
   * `frontend/src/auth.js`의 토큰 보관 키(`"token"`, `"userName"`), Axios 요청 인터셉터의 Bearer 헤더 주입, 401 응답 시 세션 만료 인터셉터 보존.
2. **백엔드/DB/API 계약**:
   * 모든 쿼리 파라미터 및 엔드포인트 URL 형태 보존.
   * DB 컬럼명을 임의로 유추하거나 변경하지 않음 (`schema-overview.md` 준수).
3. **비즈니스 로직**:
   * 1RM 추정 공식, DROP 세트 `setGroup` UUID 연결 로직, 유산소 집계 방식, 식단 섭취량 비례 영양소 계산식.
4. **기록 탭 언마운트 초기화 동작 (기존과 동일)**:
   * 의도된 동작으로, 사용자의 별도 승인 없이 임의로 전역 상태로 올리거나 수정하지 마십시오.

---

## F. 범위 변경 및 주의 사항

1. **텔레그램 / Discord 프론트엔드 UI (범위 변경: 포함으로 전환)**:
   * **2026-11-05 사용자 지침에 따라 제외 지시가 해제됨**:
     * 설정(Settings) 탭에 텔레그램 봇 연결 및 Discord 웹훅 카드를 실제 백엔드 지원 범위 내에서 구성합니다.
     * 실제 백엔드 API 계약을 먼저 확인하고, 지원하지 않는 기능은 임의로 가짜 UI나 모의 성공을 생성하지 않습니다.
     * Discord 웹훅 URL은 기본적으로 마스킹 처리하고, 콘솔/토스트에 노출하지 않습니다.
     * 테스트 전송 및 연결 코드 발급은 사용자가 명시적으로 클릭할 때만 실행하며, 사전 검증을 이유로 자동 실행하지 않습니다.
2. **임의의 라이브러리 및 도구 도입 금지**:
   * `react-router-dom` 등 URL 라우팅 패키지 신규 도입 금지 (`useState` 기반 탭 전환 유지).
   * Remix Icon 등 외부 웹폰트/CDN 도입 금지.
   * 임의의 드래그 앤 드롭 패키지 도입 금지.

---

## G. 검증 상태 구분 보고

1. **실제 실행한 빌드 및 코드 검증 (성공)**:
   * `cd frontend; npm run build` -> **Exit Code 0** 성공 (산출물 gzip: main.js 215 kB, main.css 1.83 kB).
   * **Compiled successfully** (기존 및 신규 ESLint 경고 0건).
2. **브라우저 확인 완료 항목**:
   * 공통 앱 셸 (PC 사이드바 / 모바일 헤더 & 하단 5탭바)
   * 홈 화면 요약 카드, 최근 운동, 미니 달력
   * 기록 화면 근력/유산소 입력 폼, 타이머, 세트 목록 UI
   * 달력 화면 42칸 그리드, 월 이동, 오늘 바로가기, 선택일 상세 내역
   * 분석 화면 볼륨, 1RM, 추세, ML 4종 서브탭
   * 건강 화면 바디, 유산소, 식단, 루틴, AI 5종 서브탭
3. **미실행 검증 항목 (사용자 지침에 따라 실행 금지)**:
   * 실제 운영/개발 DB 대상 운동 기록 `POST`/`DELETE`, 바디 `POST`/`DELETE`, 식단 `POST`/`DELETE`, AI 생성 `POST /ai/recommend`, 텔레그램 연동 코드 발급/메시지 전송 등 데이터 변이 및 비용 유발 테스트는 사용자 별도 승인 없이 실행하지 않음.

---

## H. Git 및 복구 기준

1. **브랜치 구조**:
   * `main`: 리디자인 시작 전 상태 (`e43fa5669793a4e18e59cf9bdcddd21c0d5a020b`)
   * `backup/pre-redesign`: 리디자인 시작 전 상태 영구 보존용 브랜치 (`e43fa5669793a4e18e59cf9bdcddd21c0d5a020b`)
   * `feature/redesign-shell-home`: 현재 리디자인 작업 브랜치
2. **체크포인트 커밋 이력**:
   * `e43fa56`: (기준 커밋) `feat: 메인 화면 즉시 로그아웃 추가...`
   * `e599a57`: `feat: implement common app shell and home screen redesign`
   * `988b433`: `feat: implement record tab redesign (strength and cardio panels)`
   * `5317734`: `feat: implement calendar tab redesign (month grid and day detail)`
   * `e0e0106`: `feat: implement analytics tab redesign (volume, 1rm, trends, ml)`
   * `56d6681`: `feat: redesign health screen with 5 subtabs (body, cardio, meal, routine, ai)`
3. **외부 안전 백업**:
   * 경로: `C:\Users\Arthur\Documents\project\overloader_backups\design-reference` (30개 파일 완전 보존 확인 완료)
4. **로컬 파일 상태 구분**:
   * `GEMINI.md`: Git 추적 파일 (커밋 `790eb91`로 안전하게 보존 중, 무단 수정/삭제 금지)
   * `schema-overview.md`: DB 스키마 정의 문서 (미추적 상태 유지)
   * `design-reference/`: PC/모바일 디자인 시안 파일 (미추적 상태 유지)

---

## I. 다음 세션 작업 지침 (설정 탭)

1. **다음 대상**: **설정(Settings) 탭** 리디자인
2. **포함 요소**:
   * 다크 / 라이트 모드 테마 전환
   * 계정 정보 표시 및 로그아웃
   * 홈 최근 운동 표시 토글
   * 텔레그램 봇 연동 카드 (기존 백엔드 API 계약 확인 기반)
   * Discord 웹훅 설정 카드 (기존 백엔드 API 계약 확인 기반)
3. **시작 전 필수 확인**:
   * 백엔드 `main.py` 및 관련 라우터에서 설정, 텔레그램, Discord API 경로와 스키마 확인.
   * `design-reference/desktop/14.png` 및 `design-reference/mobile/14.pdf` 확인.
4. **주의 사항**:
   * 텔레그램 코드 발급이나 Discord 테스트 전송을 사전 테스트 목적으로 임의 실행하지 말 것.
   * Discord 웹훅 URL 마스킹 및 비밀값 출력 금지 준수.
