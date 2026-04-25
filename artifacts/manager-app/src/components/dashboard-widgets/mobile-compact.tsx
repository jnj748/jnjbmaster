import { useState, type ReactNode, type ElementType } from "react";
import { Link } from "wouter";

// [Task #327] 모바일 컴팩트 대시보드용 공유 빌딩 블록.
// - MobileOnly / DesktopOnly: layout.tsx 의 .dash-mobile-only /
//   .dash-desktop-only 클래스(@media max-width:899px)에 의존한다.
//   JS 로 viewport 측정하지 않으므로 SSR 친화 + 깜빡임 없음.
// - MobileKpiStrip: 2×2(또는 1줄) 핵심 KPI 카드 묶음.
// - MobileTabPanels: 가로 탭 + 단일 활성 패널 (탭 내부 스크롤은
//   layout-content-area 가 담당, nested overflow 없음).

export function MobileOnly({ children }: { children: ReactNode }) {
  return <div className="dash-mobile-only">{children}</div>;
}

export function DesktopOnly({ children }: { children: ReactNode }) {
  return <div className="dash-desktop-only">{children}</div>;
}

export type KpiHighlight = "default" | "warn" | "danger" | "good" | "info";

// [사용자 요청 2026-04] 배경색 과다로 시각 피로 — KPI 카드 배경은 모두 화이트로
// 통일하고 강조는 보더 색상으로만 표현한다. (이전: bg-amber-50 / bg-red-50 등)
const HIGHLIGHT_STYLES: Record<KpiHighlight, string> = {
  default: "border-border bg-card",
  warn: "border-amber-200 bg-card",
  danger: "border-red-200 bg-card",
  good: "border-emerald-200 bg-card",
  info: "border-blue-200 bg-card",
};

export interface KpiItem {
  key: string;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: ElementType;
  iconClass?: string;
  iconBg?: string;
  href?: string;
  onClick?: () => void;
  highlight?: KpiHighlight;
}

export function MobileKpiStrip({ items }: { items: KpiItem[] }) {
  const colsClass =
    items.length >= 4 ? "grid-cols-2"
    : items.length === 3 ? "grid-cols-3"
    : items.length === 2 ? "grid-cols-2"
    : "grid-cols-1";

  return (
    <div className={`grid ${colsClass} gap-2`} data-testid="mobile-kpi-strip">
      {items.map((it) => {
        const Icon = it.icon;
        const interactive = !!(it.href || it.onClick);
        const card = (
          <div
            className={`rounded-lg border p-2.5 h-[68px] flex items-center gap-2 ${HIGHLIGHT_STYLES[it.highlight ?? "default"]} ${interactive ? "cursor-pointer hover:bg-muted/30 transition-colors" : ""}`}
            data-testid={`mobile-kpi-${it.key}`}
            onClick={it.onClick}
          >
            {/* [사용자 요청] 아이콘 컨테이너 배경(bg-chart-N / bg-rose-N 등) 제거.
                색은 아이콘 자체로만 표현해 시각 노이즈 최소화. */}
            <span className="p-1.5 shrink-0">
              <Icon className={`w-4 h-4 ${it.iconClass && it.iconClass !== "text-white" ? it.iconClass : "text-foreground"}`} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-muted-foreground leading-tight truncate">{it.label}</p>
              <p className="text-[15px] font-bold leading-tight truncate">{it.value}</p>
              {it.hint != null && (
                <p className="text-[9px] text-muted-foreground leading-tight truncate">{it.hint}</p>
              )}
            </div>
          </div>
        );
        return (
          <div key={it.key}>
            {it.href ? <Link href={it.href}>{card}</Link> : card}
          </div>
        );
      })}
    </div>
  );
}

export interface TabSection {
  key: string;
  label: string;
  badge?: ReactNode;
  content: ReactNode;
}

export function MobileTabPanels({
  sections,
  defaultKey,
}: {
  sections: TabSection[];
  defaultKey?: string;
}) {
  const initial = defaultKey ?? sections[0]?.key ?? "";
  const [active, setActive] = useState<string>(initial);
  const activeSection = sections.find((s) => s.key === active) ?? sections[0];

  return (
    <div data-testid="mobile-tab-panels">
      <div
        role="tablist"
        className="flex items-center gap-1 border-b overflow-x-auto -mx-3 px-3 mb-3"
        style={{ scrollbarWidth: "none" }}
      >
        {sections.map((s) => {
          const isActive = s.key === active;
          return (
            <button
              key={s.key}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => setActive(s.key)}
              data-testid={`mobile-tab-${s.key}`}
              className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
              {s.badge != null && <span className="ml-1">{s.badge}</span>}
            </button>
          );
        })}
      </div>
      <div data-testid={`mobile-tab-content-${active}`}>{activeSection?.content}</div>
    </div>
  );
}
