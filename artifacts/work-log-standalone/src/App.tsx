import { useEffect, useState } from "react";
import { DailyWizard } from "@/components/DailyWizard";
import { QuickEntry } from "@/components/QuickEntry";
import { ReportView } from "@/components/ReportView";
import { todayKst, formatKstDate } from "@/lib/utils";

type Tab = "wizard" | "quick" | "daily" | "weekly" | "monthly";

const TABS: { value: Tab; label: string }[] = [
  { value: "wizard", label: "일지 (4단계)" },
  { value: "quick", label: "빠른 메모" },
  { value: "daily", label: "일보" },
  { value: "weekly", label: "주보" },
  { value: "monthly", label: "월보" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("wizard");
  const [date, setDate] = useState<string>(todayKst());
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setDate(todayKst());
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header no-print">
        <div>
          <h1>관리소장 업무일지</h1>
          <div className="subtitle">
            업무기록 → 일지 → 주보 → 월보 — 단일 폴더 휴대용 앱
          </div>
        </div>
        <div className="row">
          <label className="label" style={{ marginBottom: 0 }}>
            기준일
          </label>
          <input
            type="date"
            className="input"
            style={{ width: "auto" }}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            data-testid="header-date"
          />
        </div>
      </header>

      <nav className="tabs no-print" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={tab === t.value}
            className={"tab" + (tab === t.value ? " active" : "")}
            onClick={() => setTab(t.value)}
            data-testid={`tab-${t.value}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div aria-live="polite">
        {tab === "wizard" && (
          <DailyWizard
            date={date}
            onSaved={() => setRefreshKey((k) => k + 1)}
          />
        )}
        {tab === "quick" && (
          <QuickEntry
            refreshKey={refreshKey}
            onChanged={() => setRefreshKey((k) => k + 1)}
          />
        )}
        {tab === "daily" && <ReportView mode="daily" />}
        {tab === "weekly" && <ReportView mode="weekly" />}
        {tab === "monthly" && <ReportView mode="monthly" />}
      </div>

      <footer
        className="no-print"
        style={{
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: 11,
          marginTop: 24,
        }}
      >
        오늘 ({formatKstDate(todayKst())}) · 단일 폴더 SQLite 저장 · 인쇄로 PDF 저장
      </footer>
    </div>
  );
}
