# Overloader UI 리디자인 세션 인계 문서 (SESSION_HANDOFF.md)

작성 일시: 2026-11-04 (로컬 시간)  
기준 브랜치: `feature/redesign-shell-home`  
현재 HEAD 커밋: `e0e0106` (`feat: implement analytics tab redesign (volume, 1rm, trends, ml)`)
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
   * `1.png` / `1.pdf`: 홈 (`/`) — **승인 및 구현 완료**
   * `2.png` / `2.pdf`: 기록 > 근력 (`/record`) — **승인 및 구현 완료**
   * `3.png` / `3.pdf`: 기록 > 유산소 (`/record`) — **승인 및 구현 완료**
   * `4.png` / `4.pdf`: 달력 (`/calendar`) — **승인 및 구현 완료**
   * `5.png` / `5.pdf`: 분석 > 볼륨 (`/analyze?tab=volume`) — **승인 및 구현 완료**
   * `6.png` / `6.pdf`: 분석 > 1RM (`/analyze?tab=1rm`) — **승인 및 구현 완료**
   * `7.png` / `7.pdf`: 분석 > 추세 (`/analyze?tab=trends`) — **승인 및 구현 완료**
   * `8.png` / `8.pdf`: 분석 > 머신러닝 (`/analyze?tab=ml`) — **승인 및 구현 완료**
   * `9.png` / `9.pdf`: 건강 > 바디 (`/health?tab=body`) — **미착수**
   * `10.png` / `10.pdf`: 건강 > 유산소 통계 (`/health?tab=cardio`) — **미착수**
   * `11.png` / `11.pdf`: 건강 > 식단 (`/health?tab=meal`) — **미착수**
   * `12.png` / `12.pdf`: 건강 > 루틴 (`/health?tab=routine`) — **미착수**
   * `13.png` / `13.pdf`: 건강 > AI 코칭 (`/health?tab=ai`) — **미착수**
   * `14.png` / `14.pdf`: 설정 (`/settings`) — **미착수**

---

## C. 사용자 승인 상태

1. **공통 앱 셸 + 홈 화면**: 브라우저 확인 후 **디자인 및 동작 승인 완료** (체크포인트: `e599a57`)
2. **기록(Record) 탭**: 브라우저 확인 후 **디자인 및 인터랙션 승인 완료** (체크포인트: `988b433`)
3. **달력(Calendar) 탭**: 브라우저 확인 후 **디자인 및 화면 배치 승인 완료** (체크포인트: `5317734`)
4. **분석(Analyze) 탭**: 브라우저 확인 후 **디자인 및 화면 구성 승인 완료** (체크포인트: `e0e0106`)
5. **후속 탭 상태 (건강/설정)**:
   * **아직 미승인 및 미착수 상태**입니다.
   * 기존 구형 화면 코드가 `App.js` 내에 그대로 보존되어 정상 작동 중입니다.
   * 사용자의 명시적인 사전 승인 없이 임의로 후속 탭 코드를 수정하거나 삭제하지 마십시오.
   * 이미 승인 완료된 셸, 홈, 기록, 달력 화면을 임의로 재설계하지 마십시오.

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
   * `frontend/src/components/common/Icons.jsx`:
     * 외부 CDN 없이 18종의 순수 인라인 SVG 컴포넌트 내장.
   * `frontend/src/styles/tokens.css`:
     * 다크/라이트 CSS 테마 토큰, 그리드 레이아웃, 버튼, 인풋, 카드 스타일.
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
   * 1RM 추정 공식, DROP 세트 `setGroup` UUID 연결 로직, 유산소 집계 방식.
4. **기록 탭 언마운트 초기화 동작 (기존과 동일)**:
   * **확인 결과**: 기존 구형 코드에서도 `tab === "record"` 조건부 렌더링으로 인해 탭 이동 시 컴포넌트가 언마운트되어 미저장 세트/입력값/타이머가 초기화되었습니다. 현재 새 구현도 동일하게 초기화되며, 이는 코드상 의도된 동작입니다. 사용자의 별도 승인 없이 임의로 전역 상태로 올리거나 수정하지 마십시오.

---

## F. 명시적 범위 제외 사항

1. **텔레그램 / Discord 프론트엔드 UI**:
   * 사용자의 명시적 지침에 따라 텔레그램 연동 카드, Discord 웹훅 카드, 연결 코드 발급 UI는 프론트엔드에서 노출하지 않습니다.
   * '준비 중' 카드나 비활성화된 메뉴도 생성하지 않습니다.
   * 단, 백엔드 DB 및 엔드포인트에 저장된 기존 설정 로직은 일체 삭제하지 않고 보존합니다.
2. **임의의 라이브러리 및 도구 도입 금지**:
   * `react-router-dom` 등 URL 라우팅 패키지 신규 도입 금지 (`useState` 기반 탭 전환 유지).
   * Remix Icon 등 외부 웹폰트/CDN 도입 금지.
   * 임의의 드래그 앤 드롭 패키지 도입 금지.

---

## G. 검증 상태 구분 보고

1. **실제 실행한 빌드 및 코드 검증 (성공)**:
   * `cd frontend; npm run build` -> **Exit Code 0** 성공 (산출물 gzip: main.js 210 kB, main.css 1.57 kB).
   * 신규 컴포넌트(`RecordScreen.jsx`, `CalendarScreen.jsx`, `HomeScreen.jsx`, `AppShell.jsx`, `Icons.jsx`) 0건 오류/경고.
2. **기존부터 존재하던 ESLint 경고 (9건 보존)**:
   * 미개편 탭인 `App.js` 내부의 미사용 변수(`showAdvanced`, `byWorkout`, `highlightIndex`, `subPlan`, `tagStyle` 등)와 `useEffect` 누락 의존성(`fetchTemplateNames`). 타 기능 회귀 방지를 위해 임의 수정하지 않고 보존함.
3. **브라우저 확인 완료 항목**:
   * 공통 앱 셸 (PC 사이드바 / 모바일 헤더 & 하단 5탭바)
   * 홈 화면 요약 카드, 최근 운동, 미니 달력
   * 기록 화면 근력/유산소 입력 폼, 타이머, 세트 목록 UI
   * 달력 화면 42칸 그리드, 월 이동, 오늘 바로가기, 선택일 상세 내역 분할 배치
4. **미실행 검증 항목 (사용자 지침에 따라 실행 금지)**:
   * 실제 운영/개발 DB를 대상으로 하는 운동 기록 `POST`, `DELETE`, 유산소 `POST`, `DELETE` 데이터 변경 테스트는 실행하지 않았음 (API 파라미터 규격 및 바인딩 코드 확인으로 대체).

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
3. **외부 안전 백업**:
   * 경로: `C:\Users\Arthur\Documents\project\overloader_backups\design-reference` (30개 파일 완전 보존 확인 완료)
4. **로컬 미추적 파일 보존**:
   * `GEMINI.md`: 프로젝트 작업 및 세션 재개 규칙
   * `schema-overview.md`: DB 스키마 정의 문서
   * `design-reference/`: PC/모바일 디자인 시안 파일

---

## I. 다음 세션 작업 지침 (분석 탭)

1. **다음 대상**: **분석(Analyze) 탭** 리디자인 (`볼륨`, `1RM`, `추세`, `ML` 4개 서브탭)
2. **시작 전 필수 확인**:
   * 데스크톱 시안: `design-reference/desktop/5.png` (볼륨), `6.png` (1RM), `7.png` (추세), `8.png` (ML)
   * 모바일 시안: `design-reference/mobile/5.pdf` ~ `8.pdf`
   * 기존 분석 코드: `VolumeTab`, `OneRMTab`, `TrendsTab`, `MlTab`의 계산식과 Recharts 차트 설정 확인.
3. **주의 사항**:
   * 'N일'과 'N세션'의 집계 단위를 혼동하지 말 것.
   * 실제 백엔드 분석 API 필드와 계산식을 기존 코드에서 먼저 확인하고 재사용할 것.
   * 구현 완료 후 `npm run build` 검증 -> 사용자 브라우저 확인 요청 -> 승인 후 체크포인트 커밋의 작업 순서를 반드시 지킬 것.
   * 실제 DB 변경(데이터 생성/수정/삭제)은 별도 사용자 승인 없이 실행하지 말 것.
