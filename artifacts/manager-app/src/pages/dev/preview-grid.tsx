// [DEV 분할 프리뷰 격자] 사용자 간 입력 연계를 한 화면에서 시각 검증.
//
// 동작:
//   1. 마운트 시 4명(manager/accountant/facility/partner) 의 토큰을 부모창에서 미리
//      발급받아 각자의 localStorage 키 `auth_token__dev__<email>` 에 저장한다.
//   2. iframe 격자를 띄우되, 각 iframe src 에 `?devAs=<email>` 쿼리를 붙인다.
//   3. iframe 안의 AuthProvider 가 그 쿼리를 읽어 sessionStorage 에 박아두고,
//      이후 모든 토큰 IO 를 자기 사용자 키로만 한다 → 4셀 컨텍스트가 완전 분리.
//      (main.tsx 의 setAuthTokenGetter 도 같은 키 분기를 쓴다 — 안 쓰면 React Query
//      generated hooks 가 토큰을 못 붙여 401 다발이 발생한다.)
//   4. 자동 polling 없음. 셀별 "새로고침" 버튼만 — 사장님이 직접 누를 때만 갱신.
//      (사장님 결정: 자동 polling 은 디버깅 신호를 흐림)
//
// [사장님 결정 — 모바일/웹 동시 보기 추가] 헤더의 viewport 모드 토글로 3가지 보기:
//   - "모바일": 2×2, 각 셀이 모바일 viewport (iframe width = 셀 폭, 보통 < 640)
//   - "웹"   : 2×2, 각 셀이 데스크톱 viewport (iframe width=1024 + CSS transform
//             scale 로 셀 안에 축소 표시. 글씨 작아지지만 레이아웃 한눈에 보임)
//   - "둘다" : 2행 × 4열. 위 행은 4명 모바일, 아래 행은 같은 4명 데스크톱.
//             같은 사용자의 두 viewport 를 위아래로 비교 가능.
//
// 가드 (replit.md 3중 가드 중 클라이언트 빌드 가드):
//   - 라우트 등록부에 `import.meta.env.DEV &&` 분기 → prod 빌드에서 dead code 제거.
//   - 컴포넌트 본체 첫 줄도 보호 — 만약 어떤 경로로든 prod 에서 import 되면 빈 화면.
//
// 한정 범위:
//   - 4셀 = 직원 3 (manager/accountant/facility) + 파트너 1.
//   - 본부장(hq_executive)/관리인(custodian)/관리자(platform_admin) 는 따로 빠른 로그인
//     사용 (격자에 안 넣음 — 화면 자리 부족 + 일상 흐름은 4셀로 충분).

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const TEST_PASSWORD = "test1234!";

// manager-app 의 MobileOnly/DesktopOnly breakpoint 가 900px 이므로 데스크톱 셀은
// 그것을 넘기는 폭으로 iframe 을 두고, CSS transform 으로 셀에 맞게 축소한다.
const DESKTOP_IFRAME_WIDTH = 1024;

type ViewMode = "mobile" | "desktop" | "both";

interface Cell {
  email: string;
  label: string;
  // 셀 진입 시 기본 경로. 사용자가 셀 안에서 자유롭게 이동 가능 (그 경로는 격자가 모름).
  defaultPath: string;
}

const CELLS: Cell[] = [
  { email: "manager@test.com", label: "관리소장 (manager)", defaultPath: "/" },
  { email: "accountant@test.com", label: "경리 (accountant)", defaultPath: "/" },
  { email: "facility@test.com", label: "시설기사 (facility)", defaultPath: "/" },
  { email: "partner@test.com", label: "파트너 (partner)", defaultPath: "/" },
];

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`;

interface PrepState {
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
}

export default function DevPreviewGrid() {
  if (!import.meta.env.DEV) return null;

  const [prep, setPrep] = useState<PrepState>({ status: "loading" });
  // 셀별 새로고침 트리거 — 변경 시 iframe key 가 바뀌어 강제 리마운트.
  const [reloadCounters, setReloadCounters] = useState<Record<string, number>>(
    () => Object.fromEntries(CELLS.map((c) => [c.email, 0])),
  );
  // 셀별 사용자 입력 경로 (옵션). 비워 두면 defaultPath 사용.
  const [pathOverrides, setPathOverrides] = useState<Record<string, string>>(
    () => Object.fromEntries(CELLS.map((c) => [c.email, c.defaultPath])),
  );
  // [URL 제어] `?view=mobile|desktop|both` 로 초기 viewMode 결정 — 즐겨찾기/스크린샷
  //   검증을 위해. 토글 변경 시 URL 도 함께 업데이트한다(replaceState — 히스토리 안 쌓음).
  // [기본값 — 사장님 결정] 데스크톱(웹) 2×2 가 기본. 사장님이 평소 검수하는 화면이 데스크톱
  //   레이아웃이고, 모바일은 ?view=mobile 로 명시할 때만 본다.
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("view");
    return fromUrl === "mobile" || fromUrl === "desktop" || fromUrl === "both"
      ? fromUrl
      : "desktop";
  });
  function setViewMode(next: ViewMode) {
    setViewModeState(next);
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.replaceState(null, "", url.toString());
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        for (const cell of CELLS) {
          // 이미 토큰이 있으면 재사용 — 격자를 새로고침해도 매번 로그인 호출하지 않음.
          const key = `auth_token__dev__${cell.email}`;
          if (window.localStorage.getItem(key)) continue;

          const res = await fetch(`${API_BASE}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifier: cell.email, password: TEST_PASSWORD }),
          });
          if (!res.ok) {
            const txt = await res.text();
            throw new Error(`${cell.email} 로그인 실패: ${res.status} ${txt}`);
          }
          const data = await res.json();
          window.localStorage.setItem(key, data.token);
        }
        if (!cancelled) setPrep({ status: "ready" });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!cancelled) setPrep({ status: "error", error: msg });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function clearAndReset() {
    for (const cell of CELLS) {
      window.localStorage.removeItem(`auth_token__dev__${cell.email}`);
    }
    setPrep({ status: "loading" });
    // 다시 로그인 흐름 트리거 — 컴포넌트는 그대로지만 useEffect 가 재실행되도록 페이지 새로고침.
    window.location.reload();
  }

  function reloadCell(email: string) {
    setReloadCounters((prev) => ({ ...prev, [email]: (prev[email] ?? 0) + 1 }));
  }

  function reloadAll() {
    setReloadCounters((prev) => {
      const next: Record<string, number> = {};
      for (const cell of CELLS) next[cell.email] = (prev[cell.email] ?? 0) + 1;
      return next;
    });
  }

  function buildIframeSrc(cell: Cell): string {
    const rawPath = pathOverrides[cell.email] || cell.defaultPath;
    // [방어] 사용자가 path 에 자기 devAs 를 또 박을 수 있다 — 잘못된 컨텍스트 핀 방지를
    //   위해 기존 devAs 쿼리는 제거하고 격자가 강제하는 값으로 다시 붙인다.
    const [pathPart, queryPart = ""] = rawPath.split("?", 2);
    const cleanedQuery = new URLSearchParams(queryPart);
    cleanedQuery.delete("devAs");
    cleanedQuery.set("devAs", cell.email);
    const cleanPath = pathPart.startsWith("/") ? pathPart.slice(1) : pathPart;
    return `${BASE}${cleanPath}?${cleanedQuery.toString()}`;
  }

  // 격자 컨테이너 클래스 — viewMode 에 따라 행/열 결정.
  // both: 2행 × 4열 (위 모바일, 아래 데스크톱). 그 외: 2×2.
  const gridClass =
    viewMode === "both"
      ? "grid flex-1 grid-cols-4 grid-rows-2 gap-1 bg-slate-300 p-1"
      : "grid flex-1 grid-cols-2 grid-rows-2 gap-1 bg-slate-300 p-1";

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-300 bg-white px-4 py-2 text-sm">
        <span className="font-bold text-rose-600">[DEV] 분할 프리뷰 격자</span>
        <span className="text-slate-600">
          한쪽에서 입력한 뒤 반대편 셀의 "새로고침" 을 눌러 반영을 확인.
        </span>
        <span className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-1 text-xs text-slate-700">
            보기:
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as ViewMode)}
              className="rounded border border-slate-300 px-1 py-0.5 text-xs"
            >
              <option value="mobile">모바일 (2×2)</option>
              <option value="desktop">웹 (2×2)</option>
              <option value="both">모바일+웹 동시 (2행×4열)</option>
            </select>
          </label>
          {prep.status === "loading" && <span className="text-slate-500">4명 토큰 발급 중…</span>}
          {prep.status === "ready" && <span className="text-emerald-600">토큰 준비 완료</span>}
          {prep.status === "error" && (
            <span className="text-rose-600">에러: {prep.error}</span>
          )}
          <button
            type="button"
            onClick={reloadAll}
            disabled={prep.status !== "ready"}
            className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
          >
            전체 새로고침
          </button>
          <button
            type="button"
            onClick={clearAndReset}
            className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
          >
            토큰 초기화 + 재발급
          </button>
        </span>
      </header>

      <div className={gridClass}>
        {viewMode === "both" ? (
          <>
            {/* 1행: 4명 모바일 */}
            {CELLS.map((cell) => (
              <CellPanel
                key={`m::${cell.email}`}
                cell={cell}
                viewport="mobile"
                disabled={prep.status !== "ready"}
                iframeSrc={buildIframeSrc(cell)}
                reloadKey={reloadCounters[cell.email] ?? 0}
                pathValue={pathOverrides[cell.email] ?? cell.defaultPath}
                onPathChange={(v) =>
                  setPathOverrides((prev) => ({ ...prev, [cell.email]: v }))
                }
                onReload={() => reloadCell(cell.email)}
              />
            ))}
            {/* 2행: 같은 4명 데스크톱 */}
            {CELLS.map((cell) => (
              <CellPanel
                key={`d::${cell.email}`}
                cell={cell}
                viewport="desktop"
                disabled={prep.status !== "ready"}
                iframeSrc={buildIframeSrc(cell)}
                reloadKey={reloadCounters[cell.email] ?? 0}
                pathValue={pathOverrides[cell.email] ?? cell.defaultPath}
                onPathChange={(v) =>
                  setPathOverrides((prev) => ({ ...prev, [cell.email]: v }))
                }
                onReload={() => reloadCell(cell.email)}
              />
            ))}
          </>
        ) : (
          CELLS.map((cell) => (
            <CellPanel
              key={cell.email}
              cell={cell}
              viewport={viewMode}
              disabled={prep.status !== "ready"}
              iframeSrc={buildIframeSrc(cell)}
              reloadKey={reloadCounters[cell.email] ?? 0}
              pathValue={pathOverrides[cell.email] ?? cell.defaultPath}
              onPathChange={(v) =>
                setPathOverrides((prev) => ({ ...prev, [cell.email]: v }))
              }
              onReload={() => reloadCell(cell.email)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface CellPanelProps {
  cell: Cell;
  viewport: "mobile" | "desktop";
  disabled: boolean;
  iframeSrc: string;
  reloadKey: number;
  pathValue: string;
  onPathChange: (v: string) => void;
  onReload: () => void;
}

function CellPanel({
  cell,
  viewport,
  disabled,
  iframeSrc,
  reloadKey,
  pathValue,
  onPathChange,
  onReload,
}: CellPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex min-h-0 min-w-0 flex-col bg-white">
      <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1 text-xs">
        <span className="font-semibold text-slate-700">{cell.label}</span>
        <span
          className={`rounded px-1 text-[10px] ${
            viewport === "desktop"
              ? "bg-indigo-100 text-indigo-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {viewport === "desktop" ? "웹" : "모바일"}
        </span>
        <input
          ref={inputRef}
          value={pathValue}
          onChange={(e) => onPathChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onReload();
          }}
          placeholder="/"
          className="ml-1 w-24 rounded border border-slate-300 px-1 py-0.5 font-mono text-[11px]"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={onReload}
          disabled={disabled}
          className="ml-auto rounded border border-slate-300 px-2 py-0.5 text-[11px] hover:bg-slate-100 disabled:opacity-50"
        >
          새로고침
        </button>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-slate-50">
        {disabled ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            토큰 발급 대기…
          </div>
        ) : viewport === "desktop" ? (
          <ScaledDesktopIframe
            src={iframeSrc}
            title={cell.label}
            iframeKey={`${cell.email}::desktop::${reloadKey}`}
          />
        ) : (
          <iframe
            key={`${cell.email}::mobile::${reloadKey}`}
            src={iframeSrc}
            title={cell.label}
            className="h-full w-full border-0 bg-white"
          />
        )}
      </div>
    </div>
  );
}

// 셀 안에 데스크톱 viewport(width=1024)+ 페이지를 통째로 보여주기 위해 CSS transform
//   scale 로 셀 폭에 맞게 축소한다. 글씨가 작아지지만 레이아웃을 한눈에 비교 가능.
//   - ResizeObserver 로 컨테이너 폭 변경(사장님이 창 크기 조절) 시 scale 재계산.
//   - height 는 1/scale 로 키워 두고 transform-origin top-left 로 좌상단 기준 축소 →
//     셀 안의 가용 영역을 가득 채운다. iframe 내부 스크롤은 그대로 살아 있어 사장님이
//     셀 안에서 페이지 아래쪽까지 스크롤 가능.
function ScaledDesktopIframe({
  src,
  title,
  iframeKey,
}: {
  src: string;
  title: string;
  iframeKey: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? DESKTOP_IFRAME_WIDTH;
      // 정확히 fit (가로 스크롤 안 생기게) + 상한 1 (셀 폭이 1024 보다 클 경우 확대
      //   하지 않음 — 확대되면 height 100/scale% 가 100% 미만이 되어 셀 하단에 빈
      //   영역이 생긴다). 4셀/8셀 격자에서 사실상 안 닿는 케이스지만 안전망.
      setScale(Math.max(0.1, Math.min(1, w / DESKTOP_IFRAME_WIDTH)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <iframe
        key={iframeKey}
        src={src}
        title={`${title} (웹)`}
        style={{
          width: `${DESKTOP_IFRAME_WIDTH}px`,
          height: `${100 / scale}%`,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          border: 0,
          background: "white",
        }}
      />
    </div>
  );
}
