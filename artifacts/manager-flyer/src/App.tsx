import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Bell,
  CalendarClock,
  Building2,
  PenLine,
  Share2,
  Printer,
  Presentation,
  Sparkles,
  Wrench,
  Layers3,
  CheckCircle2,
  ArrowDownCircle,
  ScanLine,
  Globe,
  MessageCircle,
  Smartphone,
} from "lucide-react";

import qrImg from "@assets/26Iq2_1777356586986.jpg";

const A4_WIDTH_PX = (210 * 96) / 25.4;
const A4_WIDTH_INCH = 210 / 25.4;
const A4_HEIGHT_INCH = 297 / 25.4;

async function exportFlyerToPptx() {
  const page = document.querySelector(".flyer-page") as HTMLElement | null;
  if (!page) return;
  const prevTransform = page.style.transform;
  page.style.transform = "none";
  try {
    const [{ default: html2canvas }, { default: PptxGenJS }] = await Promise.all([
      import("html2canvas-pro"),
      import("pptxgenjs"),
    ]);
    const canvas = await html2canvas(page, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      logging: false,
      width: page.offsetWidth,
      height: page.offsetHeight,
      windowWidth: page.offsetWidth,
      windowHeight: page.offsetHeight,
    });
    const dataUrl = canvas.toDataURL("image/png");
    const pptx = new PptxGenJS();
    pptx.defineLayout({
      name: "A4_PORTRAIT",
      width: A4_WIDTH_INCH,
      height: A4_HEIGHT_INCH,
    });
    pptx.layout = "A4_PORTRAIT";
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addImage({
      data: dataUrl,
      x: 0,
      y: 0,
      w: A4_WIDTH_INCH,
      h: A4_HEIGHT_INCH,
    });
    await pptx.writeFile({ fileName: "관리의달인-인쇄전단.pptx" });
  } finally {
    page.style.transform = prevTransform;
  }
}

function PrintBar() {
  const [busy, setBusy] = useState(false);
  const onSavePptx = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await exportFlyerToPptx();
    } catch (err) {
      console.error("PPT export failed", err);
      alert("PPT 저장 중 문제가 발생했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="no-print fixed top-4 right-4 z-50 flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 shadow-lg backdrop-blur">
      <span className="text-xs font-semibold tracking-wide text-slate-500">
        A4 · 210 × 297mm
      </span>
      <button
        type="button"
        onClick={onSavePptx}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-4 py-1.5 text-sm font-semibold text-white shadow-md transition hover:bg-amber-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Presentation className="h-4 w-4" />
        {busy ? "PPT 만드는 중…" : "PPT 저장"}
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 rounded-full bg-blue-700 px-4 py-1.5 text-sm font-semibold text-white shadow-md transition hover:bg-blue-800 active:scale-[0.98]"
      >
        <Printer className="h-4 w-4" />
        인쇄 / PDF 저장
      </button>
    </div>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-700 text-white shadow-[0_6px_16px_-6px_rgba(29,78,216,0.55)]">
        <span className="text-[26px] font-black leading-none tracking-tight">
          {n.toString().padStart(2, "0")}
        </span>
      </div>
      <div className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-extrabold tracking-[0.2em] text-blue-700">
        POINT
      </div>
    </div>
  );
}

function Section1() {
  return (
    <section className="flyer-section flex-row items-center gap-4 px-[12mm] py-[5mm]" style={{ flexDirection: "row" }}>
      <div className="absolute inset-y-0 left-0 w-[8mm] bg-gradient-to-b from-blue-700 to-blue-900" />

      <div className="ml-[6mm] flex flex-1 flex-col justify-center">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold tracking-[0.22em] text-blue-700">
            AI BUILDING MANAGEMENT
          </span>
        </div>

        <h1 className="mt-2 text-[36px] font-black leading-[1.05] tracking-tight text-slate-900">
          <span className="text-blue-700">관리의달인</span>{" "}
          <span className="whitespace-nowrap">AI건물관리</span>{" "}
          <span className="relative inline-block">
            <span className="relative z-10">무료 배포</span>
            <span className="absolute inset-x-0 bottom-1 -z-0 h-3.5 bg-yellow-200/70" />
          </span>
        </h1>

        <p className="mt-2 text-[14px] font-bold leading-snug text-slate-900">
          AI로 실현하는 스마트 건물관리 솔루션.
          <br />
          <span className="text-blue-700">법정업무를 자동으로 관리</span>하고{" "}
          <span className="text-blue-700">문서작성까지</span> 마쳐줍니다.
        </p>

        <div className="mt-2 inline-flex items-center self-start gap-2 rounded-md bg-yellow-300 px-3 py-1.5 text-[14px] font-extrabold leading-tight text-blue-900 shadow-[0_2px_0_rgba(0,0,0,0.05)]">
          <Sparkles className="h-4 w-4" />
          이번달 가입 소장님에 한하여
          <span className="text-rose-600">AI건물관리 솔루션 평생 무료!!</span>
        </div>
      </div>

      <div className="relative flex shrink-0 flex-col items-center justify-center gap-2">
        <div className="flex h-[30mm] w-[30mm] items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-900 shadow-[0_12px_24px_-12px_rgba(29,78,216,0.6)]">
          <Building2 className="h-14 w-14 text-white/95" strokeWidth={1.6} />
        </div>
        <div className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-extrabold text-amber-800">
          <Sparkles className="h-3.5 w-3.5" />
          AI 자동화
        </div>
      </div>
    </section>
  );
}

function Section2() {
  return (
    <section
      className="flyer-section grid grid-cols-[18mm_1fr_60mm] gap-3 px-[12mm] py-[5mm]"
      style={{ display: "grid" }}
    >
      <div className="flex items-center justify-center">
        <StepNumber n={1} />
      </div>

      <div className="flex flex-col justify-center">
        <div className="flex items-center gap-2 text-blue-700">
          <Bell className="h-4 w-4" />
          <span className="text-[11px] font-extrabold tracking-[0.22em]">
            LEGAL TASK ALERT
          </span>
        </div>
        <h2 className="mt-1 text-[26px] font-black leading-[1.15] tracking-tight text-slate-900">
          법정필수업무 스케줄
          <br />
          <span className="text-blue-700">자동알림</span>
        </h2>
        <p className="mt-2 text-[14.5px] font-semibold leading-snug text-slate-700">
          AI가 제안하는 <b className="text-slate-900">건물관리업무 자동알림</b>
        </p>
      </div>

      <div className="flex items-center">
        <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-rose-600">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
              필수업무현황
            </span>
            <span className="text-[8px] text-slate-400">모두보기 ›</span>
          </div>
          <ul className="space-y-1">
            {[
              { label: "정화조 청소 점검", d: "D-20", tone: "amber" },
              { label: "승강기 자체점검", d: "D-12", tone: "amber" },
              { label: "전기설비 월차 점검", d: "D-17", tone: "amber" },
              { label: "호실데이터 기한 초과", d: "3월 지남", tone: "rose" },
            ].map((it) => (
              <li
                key={it.label}
                className={`flex items-center gap-2 rounded-md border-l-[3px] px-1.5 py-1 ${
                  it.tone === "rose"
                    ? "border-rose-500 bg-rose-50"
                    : "border-amber-400 bg-amber-50/60"
                }`}
              >
                <span
                  className={`flex h-3 w-3 items-center justify-center rounded-full ${
                    it.tone === "rose" ? "bg-rose-500" : "bg-amber-400"
                  }`}
                />
                <span className="flex-1 truncate text-[9.5px] font-semibold text-slate-800">
                  {it.label}
                </span>
                <span
                  className={`text-[9px] font-extrabold ${
                    it.tone === "rose" ? "text-rose-600" : "text-amber-700"
                  }`}
                >
                  {it.d}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-1.5 flex items-center justify-center gap-1 rounded-md bg-blue-50 py-1 text-[9px] font-bold text-blue-700">
            <CalendarClock className="h-3 w-3" />
            AI가 마감일을 매일 체크합니다
          </div>
        </div>
      </div>
    </section>
  );
}

function Section3() {
  return (
    <section
      className="flyer-section grid grid-cols-[18mm_1fr_60mm] gap-3 px-[12mm] py-[5mm]"
      style={{
        display: "grid",
        background:
          "linear-gradient(90deg, rgba(239,246,255,0.6), #fff 35%, #fff 65%, rgba(239,246,255,0.6))",
      }}
    >
      <div className="flex items-center justify-center">
        <StepNumber n={2} />
      </div>

      <div className="flex flex-col justify-center">
        <div className="flex items-center gap-2 text-blue-700">
          <PenLine className="h-4 w-4" />
          <span className="text-[11px] font-extrabold tracking-[0.22em]">
            AI DOCUMENT WRITER
          </span>
        </div>
        <h2 className="mt-1 text-[22px] font-black leading-[1.15] tracking-tight text-slate-900">
          공고문·보고서·기안서·일일보고서
          <br />
          <span className="text-blue-700">AI 자동 작성</span>
        </h2>
        <ul className="mt-2 space-y-1 text-[13.5px] font-semibold text-slate-700">
          <li className="flex items-start gap-1.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            출력·SNS 공유 모두 가능, <b className="text-slate-900">클릭만으로</b>
          </li>
          <li className="flex items-start gap-1.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <b className="text-slate-900">주간보고서·월간보고서</b> 자동 생성
          </li>
        </ul>
      </div>

      <div className="relative flex items-center gap-1">
        <div className="relative h-[44mm] w-[30mm] shrink-0 rotate-[-3deg] rounded-md border border-blue-200 bg-white p-1.5 shadow-md">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1">
            <span className="text-[8px] font-bold tracking-wider text-blue-700">공 고 문</span>
            <span className="rounded-sm bg-slate-100 px-1 text-[6.5px] font-semibold text-slate-500">
              상시
            </span>
          </div>
          <div className="mt-1 rounded-sm bg-blue-50 px-1 py-0.5 text-center text-[7.5px] font-bold leading-tight text-blue-700">
            공용시설 내 개인물품
            <br />
            설치 제한 안내
          </div>
          <div
            className="mt-1.5 space-y-[1px] text-[6px] font-medium leading-[1.45] text-slate-600"
            style={{ wordBreak: "keep-all" }}
          >
            <p>입주민 여러분의 협조에 감사드립니다.</p>
            <p>1. 복도·계단 등 공용공간 내</p>
            <p className="pl-1.5">개인물품 적치를 금지합니다.</p>
            <p>2. 화재 시 대피로 확보를 위한</p>
            <p className="pl-1.5">조치이오니 양해 부탁드립니다.</p>
            <p>3. 미이행 시 자진 철거 요청</p>
            <p className="pl-1.5">드릴 수 있습니다.</p>
          </div>
          <div className="mt-1 flex items-center justify-end gap-1 text-[6px] font-bold text-slate-500">
            <span>관리사무소장</span>
            <div className="h-3 w-3 rounded-full border border-rose-300 text-[5px] font-bold text-rose-500 flex items-center justify-center">
              印
            </div>
          </div>
          <div className="absolute -top-1.5 -left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-700 text-[7px] font-extrabold text-white shadow">
            AI
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center text-blue-500">
          <div className="text-[10px] font-extrabold leading-none tracking-tight">
            →
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-1.5">
          <div className="relative flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-1 shadow-sm">
            <div className="flex h-[10mm] w-[7mm] shrink-0 items-center justify-center rounded-md bg-slate-900">
              <Smartphone className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
              <div className="flex items-center gap-1 text-[7.5px] font-bold text-amber-700">
                <MessageCircle className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                SNS 발송
              </div>
              <div className="rounded-md rounded-tl-none bg-amber-300 px-1 py-0.5 text-[7px] font-semibold leading-tight text-slate-900">
                [공지] 공용시설…
              </div>
            </div>
          </div>

          <div className="relative flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white p-1 shadow-sm">
            <div className="flex h-[10mm] w-[7mm] shrink-0 items-center justify-center rounded-md bg-blue-700">
              <Printer className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="flex flex-1 flex-col gap-0.5">
              <div className="text-[7.5px] font-bold text-blue-700">인쇄 출력</div>
              <div className="space-y-[1.5px] rounded-sm border border-slate-200 bg-slate-50 px-1 py-0.5">
                <div className="h-[1.5px] w-full rounded bg-slate-300" />
                <div className="h-[1.5px] w-[80%] rounded bg-slate-300" />
                <div className="h-[1.5px] w-[90%] rounded bg-slate-300" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Section4() {
  return (
    <section
      className="flyer-section grid grid-cols-[18mm_1fr_60mm] gap-3 px-[12mm] py-[5mm]"
      style={{ display: "grid" }}
    >
      <div className="flex items-center justify-center">
        <StepNumber n={3} />
      </div>

      <div className="flex flex-col justify-center">
        <div className="flex items-center gap-2 text-blue-700">
          <Layers3 className="h-4 w-4" />
          <span className="text-[11px] font-extrabold tracking-[0.22em]">
            NATIONWIDE QUOTES
          </span>
        </div>
        <h2 className="mt-1 text-[26px] font-black leading-[1.15] tracking-tight text-slate-900">
          전국 파트너사의
          <br />
          <span className="text-blue-700">비교견적도 한 번에</span>
        </h2>
        <p className="mt-2 text-[14px] font-semibold leading-snug text-slate-700">
          <b className="text-slate-900">수리·수선·영선·점검·검사</b> 등<br />
          건물 관련 모든 견적을 <b className="text-blue-700">클릭 한 번으로</b>
        </p>
      </div>

      <div className="flex items-center">
        <div className="w-full rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[9.5px] font-extrabold text-slate-800">
              견적 요청 (RFQ)
            </span>
            <span className="rounded bg-blue-700 px-1.5 py-0.5 text-[8px] font-bold text-white">
              + 견적 요청
            </span>
          </div>
          <div className="space-y-1">
            {[
              { tag: "전기", t: "정기 점검", v: "5사 견적" },
              { tag: "수도", t: "누수 보수", v: "3사 견적" },
              { tag: "소방", t: "소방 시설", v: "4사 견적" },
              { tag: "영선", t: "외벽 보수", v: "6사 견적" },
            ].map((r) => (
              <div
                key={r.t}
                className="flex items-center gap-1.5 rounded-md border border-slate-100 px-1.5 py-1"
              >
                <span className="rounded-sm bg-blue-50 px-1 py-0.5 text-[8px] font-bold text-blue-700">
                  {r.tag}
                </span>
                <span className="flex-1 truncate text-[9.5px] font-semibold text-slate-800">
                  {r.t}
                </span>
                <Wrench className="h-3 w-3 text-slate-400" />
                <span className="rounded bg-emerald-50 px-1 text-[8px] font-bold text-emerald-700">
                  {r.v}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1.5 text-center text-[9px] font-semibold text-slate-500">
            한 번 요청 → 여러 업체 견적 한눈에 비교
          </div>
        </div>
      </div>
    </section>
  );
}

function Section5() {
  return (
    <section
      className="flyer-section cta items-center gap-4 bg-gradient-to-br from-blue-700 via-blue-800 to-blue-900 px-[12mm] py-[5mm] text-white"
      style={{ flexDirection: "row" }}
    >
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 25% 30%, white 1px, transparent 1px), radial-gradient(circle at 70% 70%, white 1px, transparent 1px)",
          backgroundSize: "18px 18px, 24px 24px",
        }}
      />

      <div className="relative shrink-0 rounded-xl bg-white p-1.5 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]">
        <img
          src={qrImg}
          alt="관리의달인 AI 접속 QR"
          className="h-[36mm] w-[36mm] object-contain"
        />
        <div className="mt-1 flex items-center justify-center gap-1 text-[10px] font-extrabold text-blue-800">
          <ScanLine className="h-3.5 w-3.5" />
          QR 접속
        </div>
      </div>

      <div className="relative flex flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-400 px-3 py-1 text-[12px] font-extrabold tracking-wider text-blue-900">
            <ArrowDownCircle className="h-3.5 w-3.5" />
            지금 바로 무료로 시작하세요
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Globe className="h-6 w-6 text-yellow-300" />
          <span className="text-[28px] font-black leading-none tracking-tight">
            www.jnjbmaster.com
          </span>
        </div>

        <p className="text-[13.5px] font-semibold leading-snug text-blue-100">
          웹사이트 접속 또는 QR 스캔 →
          <b className="text-white"> 관리소장 모드 무료 가입</b>
        </p>

        <div className="mt-0.5 flex items-center gap-3 border-t border-white/15 pt-1.5 text-[10px] font-semibold text-blue-100">
          <span>관리의달인</span>
          <span className="opacity-50">|</span>
          <span>AI 건물관리 솔루션</span>
          <span className="opacity-50">|</span>
          <span>전국 어디서나 배포 중</span>
        </div>
      </div>
    </section>
  );
}

function Flyer() {
  const fitRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = fitRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(w / A4_WIDTH_PX);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onBefore = () => {
      const page = document.querySelector(
        ".flyer-page",
      ) as HTMLElement | null;
      if (page) page.style.transform = "none";
    };
    const onAfter = () => {
      const page = document.querySelector(
        ".flyer-page",
      ) as HTMLElement | null;
      if (page) page.style.transform = `scale(${scale})`;
    };
    window.addEventListener("beforeprint", onBefore);
    window.addEventListener("afterprint", onAfter);
    return () => {
      window.removeEventListener("beforeprint", onBefore);
      window.removeEventListener("afterprint", onAfter);
    };
  }, [scale]);

  return (
    <div ref={fitRef} className="flyer-fit flyer-shadow">
      <article
        className="flyer-page"
        style={{ transform: `scale(${scale})` }}
      >
        <Section1 />
        <Section2 />
        <Section3 />
        <Section4 />
        <Section5 />
      </article>
    </div>
  );
}

export default function App() {
  return (
    <div className="flyer-stage">
      <PrintBar />
      <Flyer />
    </div>
  );
}
