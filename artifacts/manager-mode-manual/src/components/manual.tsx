import type { ReactNode } from "react";

export function PageHeader({ chapter, label, page, total = 34 }: {
  chapter: number; label: string; page: number; total?: number;
}) {
  return (
    <>
      <div className="absolute top-[5vh] left-[5vw] right-[5vw] flex items-center justify-between">
        <div className="flex items-center gap-[1vw]">
          <div className="w-[3vw] h-[3vw] rounded-xl bg-primary text-surface flex items-center justify-center text-[1.5vw] font-display font-black">
            {chapter}
          </div>
          <div className="text-[1.3vw] font-display font-bold tracking-[0.2em] text-primary uppercase">
            {label}
          </div>
        </div>
        <div className="text-[1.2vw] font-body text-muted">
          {String(page).padStart(2, "0")} / {total} · {chapter}챕터
        </div>
      </div>
    </>
  );
}

export function CoverHeader({ chapter, total = 34, page }: {
  chapter: number; total?: number; page: number;
}) {
  return (
    <>
      <div className="absolute top-[5vh] left-[5vw] flex items-center gap-[1vw]">
        <div className="w-[1.4vw] h-[1.4vw] rounded-md bg-primary" />
        <div className="text-[1.3vw] font-display font-bold tracking-[0.25em] text-primary uppercase">
          Chapter {chapter}
        </div>
      </div>
      <div className="absolute top-[5vh] right-[5vw] text-[1.2vw] font-body text-muted">
        {String(page).padStart(2, "0")} / {total}
      </div>
    </>
  );
}

/** Phone frame containing a real screenshot */
export function PhoneShot({ src, alt, widthVw = 22, heightVh = 70 }: {
  src: string; alt: string; widthVw?: number; heightVh?: number;
}) {
  return (
    <div
      className="bg-ink rounded-[2vw] p-[0.5vw] shadow-2xl shrink-0"
      style={{ width: `${widthVw}vw` }}
    >
      <div
        className="bg-surface rounded-[1.6vw] overflow-hidden relative flex items-start justify-center"
        style={{ height: `${heightVh}vh` }}
      >
        <img src={src} alt={alt} className="w-full h-auto" />
      </div>
    </div>
  );
}

/** Browser/desktop frame containing a real screenshot */
export function BrowserShot({ src, alt, widthVw = 56, heightVh = 70 }: {
  src: string; alt: string; widthVw?: number; heightVh?: number;
}) {
  return (
    <div
      className="bg-surface rounded-[1.2vw] shadow-2xl border border-line overflow-hidden shrink-0"
      style={{ width: `${widthVw}vw` }}
    >
      <div className="bg-bg border-b border-line px-[1vw] py-[1vh] flex items-center gap-[0.5vw]">
        <div className="w-[0.8vw] h-[0.8vw] rounded-full bg-danger/70" />
        <div className="w-[0.8vw] h-[0.8vw] rounded-full bg-accent/70" />
        <div className="w-[0.8vw] h-[0.8vw] rounded-full bg-success/70" />
        <div className="ml-[0.8vw] flex-1 bg-surface border border-line rounded-md px-[0.8vw] py-[0.4vh] text-[0.8vw] text-muted truncate">
          관리의달인 — 관리소장
        </div>
      </div>
      <div style={{ height: `${heightVh}vh` }} className="overflow-hidden bg-bg flex items-start">
        <img src={src} alt={alt} className="w-full h-auto" />
      </div>
    </div>
  );
}

export function StepCard({ n, title, body, highlight }: {
  n: number; title: string; body?: ReactNode; highlight?: boolean;
}) {
  return (
    <div
      className={
        "rounded-2xl px-[1.4vw] py-[1.4vh] flex gap-[1vw] " +
        (highlight ? "bg-primary text-surface" : "bg-surface border border-line")
      }
    >
      <div
        className={
          "shrink-0 w-[2.4vw] h-[2.4vw] rounded-lg flex items-center justify-center text-[1.3vw] font-display font-black " +
          (highlight ? "bg-surface text-primary" : "bg-primary text-surface")
        }
      >
        {n}
      </div>
      <div className="min-w-0">
        <div className={"text-[1.4vw] font-display font-bold leading-tight " + (highlight ? "text-surface" : "text-ink")}>
          {title}
        </div>
        {body !== undefined && (
          <div className={"mt-[0.4vh] text-[1.1vw] font-body leading-snug " + (highlight ? "text-surface/90" : "text-text")}>
            {body}
          </div>
        )}
      </div>
    </div>
  );
}

/** Path-breadcrumb style nav box like: 사이드바 › 든든하게 지키는 시설관리 › 필수업무 */
export function MenuPath({ items }: { items: string[] }) {
  return (
    <div className="inline-flex items-center gap-[0.6vw] bg-primary-soft border border-primary/30 rounded-xl px-[1.2vw] py-[1vh]">
      <span className="text-[1.1vw] font-body font-bold text-primary uppercase tracking-wider">
        진입경로
      </span>
      <span className="text-[1.1vw] text-muted">·</span>
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-[0.5vw]">
          <span className="text-[1.3vw] font-display font-bold text-ink">{it}</span>
          {i < items.length - 1 && <span className="text-[1.2vw] text-muted">›</span>}
        </span>
      ))}
    </div>
  );
}

export function FootBar({ leftHint, rightHint }: { leftHint?: string; rightHint?: string }) {
  return (
    <div className="absolute bottom-[3vh] left-[5vw] right-[5vw] flex items-center justify-between text-[1vw] font-body text-muted">
      <span>{leftHint ?? ""}</span>
      <span>{rightHint ?? "관리의달인 · 관리소장 모드 매뉴얼"}</span>
    </div>
  );
}

export function SlideShell({ children }: { children: ReactNode }) {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-body text-text">
      {children}
    </div>
  );
}

export function CalloutPill({ icon, text, tone = "primary" }: {
  icon?: ReactNode; text: ReactNode; tone?: "primary" | "accent" | "danger" | "success";
}) {
  const palette: Record<string, string> = {
    primary: "bg-primary-soft text-primary border-primary/30",
    accent: "bg-accent-soft text-ink border-accent/40",
    danger: "bg-danger-soft text-danger border-danger/30",
    success: "bg-success-soft text-success border-success/30",
  };
  return (
    <div className={"inline-flex items-center gap-[0.6vw] rounded-full border px-[1.2vw] py-[0.8vh] text-[1.1vw] font-display font-bold " + palette[tone]}>
      {icon}
      <span>{text}</span>
    </div>
  );
}
