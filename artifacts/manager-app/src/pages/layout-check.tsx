import { useEffect, useState } from "react";

type Sample = {
  innerWidth: number;
  innerHeight: number;
  rootWidth: number;
  rootHeight: number;
  contentWidth: number | null;
  sidebarVisible: boolean | null;
  desktopHeaderVisible: boolean | null;
  mobileHeaderVisible: boolean | null;
  bottomNavVisible: boolean | null;
  devicePixelRatio: number;
  ua: string;
};

function isVisible(el: Element | null): boolean | null {
  if (!el) return null;
  const cs = window.getComputedStyle(el);
  if (cs.display === "none" || cs.visibility === "hidden") return false;
  const rect = (el as HTMLElement).getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function read(): Sample {
  const root = document.getElementById("root");
  const rootRect = root?.getBoundingClientRect();
  const contentEl = document.querySelector(".layout-content-area");
  const contentRect = contentEl?.getBoundingClientRect() ?? null;
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    rootWidth: Math.round(rootRect?.width ?? 0),
    rootHeight: Math.round(rootRect?.height ?? 0),
    contentWidth: contentRect ? Math.round(contentRect.width) : null,
    sidebarVisible: isVisible(document.querySelector(".layout-sidebar")),
    desktopHeaderVisible: isVisible(document.querySelector(".layout-desktop-header")),
    mobileHeaderVisible: isVisible(document.querySelector(".layout-mobile-header")),
    bottomNavVisible: isVisible(document.querySelector(".layout-bottom-nav")),
    devicePixelRatio: window.devicePixelRatio,
    ua: navigator.userAgent,
  };
}

export default function LayoutCheck() {
  const [s, setS] = useState<Sample>(() => read());

  useEffect(() => {
    const update = () => setS(read());
    update();
    window.addEventListener("resize", update);
    const id = window.setInterval(update, 500);
    return () => {
      window.removeEventListener("resize", update);
      window.clearInterval(id);
    };
  }, []);

  const fillRatio = s.innerWidth ? Math.round((s.rootWidth / s.innerWidth) * 100) : 0;
  const isDesktop = s.innerWidth >= 900;
  const expected = isDesktop
    ? { sidebar: true, desktopHeader: true, mobileHeader: false, bottomNav: false }
    : { sidebar: false, desktopHeader: false, mobileHeader: true, bottomNav: true };

  const checks: Array<{ label: string; ok: boolean | null; got: string; want: string }> = [
    {
      label: "#root width fills viewport",
      ok: fillRatio >= 99,
      got: `${s.rootWidth}px (${fillRatio}%)`,
      want: `≈ ${s.innerWidth}px (100%)`,
    },
    {
      label: "viewport-meta squeeze (mobile-only emulation)",
      ok: s.innerWidth >= 600 ? s.innerWidth >= 900 || fillRatio >= 99 : null,
      got: `innerWidth=${s.innerWidth}`,
      want: "iframe 도형 폭과 일치해야 함",
    },
    {
      label: "sidebar visibility",
      ok: s.sidebarVisible === null ? null : s.sidebarVisible === expected.sidebar,
      got: String(s.sidebarVisible),
      want: String(expected.sidebar),
    },
    {
      label: "desktop header visibility",
      ok: s.desktopHeaderVisible === null ? null : s.desktopHeaderVisible === expected.desktopHeader,
      got: String(s.desktopHeaderVisible),
      want: String(expected.desktopHeader),
    },
    {
      label: "mobile header visibility",
      ok: s.mobileHeaderVisible === null ? null : s.mobileHeaderVisible === expected.mobileHeader,
      got: String(s.mobileHeaderVisible),
      want: String(expected.mobileHeader),
    },
    {
      label: "bottom nav visibility",
      ok: s.bottomNavVisible === null ? null : s.bottomNavVisible === expected.bottomNav,
      got: String(s.bottomNavVisible),
      want: String(expected.bottomNav),
    },
  ];

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, sans-serif", color: "#111", background: "#fff", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>레이아웃 진단</h1>
      <p style={{ color: "#666", marginTop: 4, marginBottom: 16, fontSize: 13 }}>
        캔버스/넓은 미리보기 좌상단 1/4 쏠림이 의심될 때 이 라우트를 임베드해 폭과 분기 가시성을 한 번에 확인합니다.
        로그인 없이 접근 가능. 레이아웃 관련 요소(<code>.layout-*</code>)는 인증 후 페이지에서만 마운트되므로,
        sidebar/header/bottom-nav 항목은 로그인 후 다른 페이지에서 본 값을 참고하세요.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 16px", fontSize: 14, marginBottom: 16 }}>
        <div style={{ color: "#666" }}>window.innerWidth × innerHeight</div>
        <div style={{ fontWeight: 600 }}>{s.innerWidth} × {s.innerHeight}px (DPR {s.devicePixelRatio})</div>
        <div style={{ color: "#666" }}>#root 실측 폭</div>
        <div style={{ fontWeight: 600 }}>{s.rootWidth} × {s.rootHeight}px</div>
        <div style={{ color: "#666" }}>레이아웃 분기 (≥900px = 데스크톱)</div>
        <div style={{ fontWeight: 600 }}>{isDesktop ? "desktop" : "mobile"}</div>
        <div style={{ color: "#666" }}>본문 컨테이너 폭</div>
        <div style={{ fontWeight: 600 }}>{s.contentWidth === null ? "(로그인 후 측정)" : `${s.contentWidth}px`}</div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#f3f4f6" }}>
            <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #e5e7eb" }}>항목</th>
            <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #e5e7eb", width: 80 }}>판정</th>
            <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #e5e7eb" }}>실제값</th>
            <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #e5e7eb" }}>기대값</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => (
            <tr key={c.label} style={{ borderBottom: "1px solid #f1f5f9" }}>
              <td style={{ padding: "8px 10px" }}>{c.label}</td>
              <td style={{ padding: "8px 10px", fontWeight: 700, color: c.ok === null ? "#9ca3af" : c.ok ? "#059669" : "#dc2626" }}>
                {c.ok === null ? "—" : c.ok ? "PASS" : "FAIL"}
              </td>
              <td style={{ padding: "8px 10px", fontFamily: "monospace" }}>{c.got}</td>
              <td style={{ padding: "8px 10px", fontFamily: "monospace", color: "#666" }}>{c.want}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <details style={{ marginTop: 16, fontSize: 12, color: "#6b7280" }}>
        <summary>UA</summary>
        <div style={{ wordBreak: "break-all", marginTop: 4 }}>{s.ua}</div>
      </details>
    </div>
  );
}
