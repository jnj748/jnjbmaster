# 관리소장 업무일지 (이식형)

관리소장의 매일 업무를 4단계 위저드(보안 → 미화 → 시설 → 민원)로 기록하고,
빠른 메모를 남기며, 주보 / 월보로 자동 집계해 인쇄(PDF) 할 수 있는 단일 폴더 웹앱입니다.

- **저장소**: SQLite 파일 한 개 (`data/work-log.sqlite`) — 외부 DB 없음
- **인증**: 없음 (단일 사용자, 로컬/사내 사용 가정)
- **포팅**: 이 폴더(`work-log-standalone/`)만 통째로 복사하면 어디서든 실행됩니다
- **외부 서비스 의존성**: 없음

## 1. 빠르게 실행하기

이 폴더를 어디든 복사한 뒤, 폴더 안에서 다음을 실행하세요.

```bash
# 1) 의존성 설치 (npm / pnpm / yarn classic 모두 가능)
npm install

# 2) 개발 서버 (Vite + Express, 핫리로드)
npm run dev

# 3) 또는 프로덕션 빌드 + 실행
npm run build
npm run start
```

기본 주소: `http://localhost:5173/`

> **요구 사항 / 호환 환경**
> - **Node.js**: v18.18 이상 (LTS 18 / 20 / 22 권장, 최신 24까지 동작 확인)
>   · `better-sqlite3` 가 N-API 를 사용하므로 Node 메이저 변경 시 자동 재컴파일.
> - **OS**: macOS / Linux / Windows 10 이상.
> - **빌드 도구**: 새 환경에서 `npm install` 시 `better-sqlite3` 가 네이티브
>   바이너리를 컴파일합니다 — Linux는 `make` + `g++`, macOS는 Xcode CLT,
>   Windows는 `windows-build-tools` 또는 Visual Studio Build Tools 가
>   필요할 수 있습니다 (사전빌드된 바이너리가 있으면 자동 사용).
> - **Python**: 3.x (`node-gyp` 의존, 대부분의 OS에 기본 포함).
>
> **패키지 매니저 호환성**
> `package.json` 의 `scripts` 가 `node ./node_modules/...` 형태로 직접
> 실행 파일을 호출하기 때문에, `node_modules` 디렉터리를 만드는
> 설치 모드가 필요합니다.
> - 지원: **npm**, **pnpm**, **yarn 1.x (classic)**, yarn 2/3 + `nodeLinker: node-modules`
> - 미지원: **yarn PnP** (`.pnp.cjs` 만 만드는 모드) — 실행 전에
>   `nodeLinker: node-modules` 로 변경하거나 npm/pnpm 을 사용해 주세요.

> **Windows 사용자 안내 (cmd.exe / PowerShell)**
> `npm run start` 는 POSIX 문법 `NODE_ENV=production node ...` 을 사용합니다.
> Windows cmd.exe / PowerShell 에서 그대로 실행하면 환경변수가 전달되지 않으니
> 다음 중 한 가지로 사용하세요.
> - **PowerShell**: `$env:NODE_ENV="production"; node ./node_modules/tsx/dist/cli.mjs server/index.ts`
> - **cmd.exe**: `set NODE_ENV=production && node ./node_modules/tsx/dist/cli.mjs server/index.ts`
> - **권장**: `npm install --save-dev cross-env` 후 `package.json` 의 `start`
>   를 `cross-env NODE_ENV=production node ./node_modules/tsx/dist/cli.mjs server/index.ts`
>   로 변경 (모든 OS에서 동일한 명령으로 실행 가능).
> 개발 모드(`npm run dev`)는 환경변수가 필요 없어 모든 OS에서 그대로 동작합니다.

### 환경변수

| 이름 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `5173` | HTTP 포트 |
| `BASE_PATH` | `/` | 서브패스 마운트 (예: `/work-log/`) |
| `DATA_DIR` | `./data` | SQLite 파일을 저장할 디렉터리 |
| `NODE_ENV` | `development` | `production` 으로 설정하면 `dist/public` 정적 파일 서빙 |

## 2. 폴더 구조

```
work-log-standalone/
├─ index.html             # Vite 진입점
├─ package.json           # 모든 의존성 (catalog/workspace 참조 없음)
├─ tsconfig.json
├─ vite.config.ts
├─ src/                   # 프론트엔드 (React + 순수 CSS)
│  ├─ main.tsx
│  ├─ App.tsx
│  ├─ index.css
│  ├─ components/
│  │  ├─ DailyWizard.tsx  # 4단계 일지 위저드 (보안/미화/시설/민원)
│  │  ├─ QuickEntry.tsx   # 빠른 메모 입력 + 당일 목록
│  │  ├─ ReportView.tsx   # 주보 / 월보 공통 화면
│  │  ├─ A4Frame.tsx      # A4 출력용 프레임 + 인쇄 CSS
│  │  └─ Modal.tsx
│  └─ lib/
│     ├─ api.ts           # fetch 기반 API 클라이언트
│     └─ utils.ts         # KST 날짜 / 라벨 / 상태 옵션
├─ server/                # 백엔드 (Express + better-sqlite3 + drizzle)
│  ├─ index.ts            # dev 모드는 Vite 미들웨어, prod 는 정적 서빙
│  ├─ routes.ts           # 모든 REST 엔드포인트
│  └─ db.ts               # SQLite 연결 + 자동 마이그레이션
└─ data/                  # 런타임 SQLite 파일 (gitignore 됨)
```

## 3. 화면 구성

### 일지 (4단계)
하루를 4개 영역으로 나누어 기록합니다.

1. **보안** — 정상순찰 / 이상발견 / 외부인방문 / 기타
2. **미화** — 전체청소완료 / 부분청소 / 분리수거 / 기타
3. **시설** — 정상가동 / 점검완료 / 수리필요 / 기타
4. **민원** — 민원없음 / 접수처리 / 조치중 / 기타

각 단계에서 **상태(필수)**, 메모, 사진 URL을 입력합니다. 마지막 단계에서 "일지 저장"을
누르면 4개 영역 중 비어있는 상태가 있을 경우 **필수 항목 모달**이 표시되고 저장이 차단됩니다.

### 빠른 메모
시설/민원/일반 카테고리 중 하나를 골라 즉시 기록합니다. 메모는 필수, 사진 URL은 선택입니다.
같은 날의 기록이 아래에 시간순으로 표시되고 삭제할 수 있습니다.

### 주보 / 월보
날짜를 고르고 "보고서 생성" 버튼을 누르면 해당 주 (월~일) 또는 해당 월의 일지·메모가
A4 양식으로 집계됩니다. 브라우저 인쇄(⌘P / Ctrl+P)로 **PDF 저장** 가능합니다.

## 4. API 엔드포인트

모든 응답은 JSON. 베이스 경로는 `${BASE_PATH}api`.

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/healthz` | 헬스체크 |
| `GET` | `/api/today` | 서버 기준 KST 오늘 날짜 |
| `GET` | `/api/daily-journals/:date` | 해당 일자 일지 (없으면 `null`) |
| `PUT` | `/api/daily-journals/:date` | 일지 저장/덮어쓰기 (4개 status 필수) |
| `GET` | `/api/work-logs?from&to&category` | 기간/카테고리 필터로 메모 조회 |
| `POST` | `/api/work-logs` | 메모 1건 추가 |
| `PATCH` | `/api/work-logs/:id` | 메모 수정 |
| `DELETE` | `/api/work-logs/:id` | 메모 삭제 |
| `GET` | `/api/reports/daily?date=YYYY-MM-DD` | 해당 일자 집계 (일보) |
| `GET` | `/api/reports/weekly?date=YYYY-MM-DD` | 해당 주(월~일) 집계 (주보) |
| `GET` | `/api/reports/monthly?date=YYYY-MM-DD` | 해당 월 집계 (월보) |

## 5. 데이터 백업 / 이관

DB 파일은 `data/work-log.sqlite` 한 개입니다. 종료 후 이 파일만 복사하면 백업/이관이
완료됩니다. SQLite CLI 또는 DBeaver 등으로 직접 열람 가능합니다.

## 6. 다른 환경으로 옮길 때

이 폴더(`work-log-standalone/`)를 통째로 복사하세요. 워크스페이스/모노레포 외부에서
실행하더라도 의존성은 모두 `package.json`에 명시된 NPM 공개 패키지뿐이라 정상 동작합니다.

```bash
cp -r work-log-standalone /path/to/anywhere
cd /path/to/anywhere/work-log-standalone
npm install
npm run dev
```

> 모노레포 안의 `pnpm-lock.yaml`이 함께 복사되었다면 외부에서는 삭제 후 다시 설치하세요.

### 6.1 이관 후 스모크 테스트

복사한 환경에서 정상 동작을 확인하는 가장 빠른 3단계 점검입니다.

```bash
# 1) 헬스체크
curl -i http://localhost:5173/api/healthz
#    → HTTP/1.1 200 OK   {"ok":true}

# 2) 일지 저장 (오늘 자)
TODAY=$(curl -s http://localhost:5173/api/today | sed 's/.*"date":"\([^"]*\)".*/\1/')
curl -i -X PUT http://localhost:5173/api/daily-journals/$TODAY \
  -H "Content-Type: application/json" \
  -d '{
    "securityStatus":"정상순찰","securityMemo":"이상 없음",
    "cleaningStatus":"청결양호","cleaningMemo":"",
    "facilityStatus":"점검완료","facilityMemo":"",
    "complaintStatus":"민원없음","complaintMemo":""
  }'
#    → 200 OK + 저장된 JSON

# 3) 주보 생성 확인
curl -s "http://localhost:5173/api/reports/weekly?date=$TODAY" | head -c 200
#    → {"start":"...","end":"...","journals":[...],"entries":[...],"summary":{...
```

세 호출이 모두 성공하면 일지 저장 → 주보/월보 집계까지 정상 동작합니다.
브라우저에서는 `http://localhost:5173/` 접속 후 "일지 (4단계)" 위저드로
같은 흐름을 수동 검증할 수 있습니다.

## 7. 라이선스

내부 사용을 가정한 도구입니다. 별도 라이선스를 부여하려면 이 폴더에 `LICENSE` 파일을
추가하세요.
