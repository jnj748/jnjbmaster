import { SlideShell, CoverHeader, MenuPath, CalloutPill } from "@/components/manual";

export default function C1Cover() {
  return (
    <SlideShell>
      <CoverHeader chapter={1} page={3} />

      <div className="absolute top-[16vh] left-[5vw] right-[5vw]">
        <div className="text-[1.5vw] font-display font-bold tracking-[0.2em] text-primary uppercase">
          1. 필수업무 처리
        </div>
        <h1 className="mt-[1vh] font-display font-black text-ink tracking-tight text-[5vw] leading-[1.05]">
          기한이 정해져 있는 일을<br />늦지 않게 처리합니다.
        </h1>
        <p className="mt-[2vh] text-[1.7vw] font-body font-medium text-muted max-w-[80vw]">
          법정 점검·소방·관리비 고지처럼 <span className="text-ink font-bold">반드시 해야 하는 업무</span>가
          모입니다. 기한이 지나면 빨간 띠로 알려 드리고, 처리 결과가 그대로 보고서에 들어갑니다.
        </p>
      </div>

      <div className="absolute top-[55vh] left-[5vw] right-[5vw] flex flex-wrap items-center gap-[1.2vw]">
        <MenuPath items={["사이드바", "든든하게 지키는 시설관리", "필수업무"]} />
        <CalloutPill text="모바일에서는 홈 화면 · 알림" tone="accent" />
      </div>

      <div className="absolute bottom-[8vh] left-[5vw] right-[5vw] grid grid-cols-3 gap-[1.5vw]">
        <div className="bg-surface border border-line rounded-2xl px-[1.4vw] py-[1.6vh]">
          <div className="text-[1.1vw] font-display font-bold tracking-[0.18em] text-primary uppercase">왜 쓰나요</div>
          <div className="mt-[0.6vh] text-[1.5vw] font-display font-bold text-ink">기한 초과 = 과태료</div>
          <div className="mt-[0.4vh] text-[1.1vw] text-muted">지난 일은 빨간 띠로 한눈에 보입니다.</div>
        </div>
        <div className="bg-surface border border-line rounded-2xl px-[1.4vw] py-[1.6vh]">
          <div className="text-[1.1vw] font-display font-bold tracking-[0.18em] text-primary uppercase">언제 보나요</div>
          <div className="mt-[0.6vh] text-[1.5vw] font-display font-bold text-ink">매일 출근 직후</div>
          <div className="mt-[0.4vh] text-[1.1vw] text-muted">홈 대시보드 첫 카드에 바로 보입니다.</div>
        </div>
        <div className="bg-surface border border-line rounded-2xl px-[1.4vw] py-[1.6vh]">
          <div className="text-[1.1vw] font-display font-bold tracking-[0.18em] text-primary uppercase">어떻게 끝나요</div>
          <div className="mt-[0.6vh] text-[1.5vw] font-display font-bold text-ink">완료 → 일보 자동</div>
          <div className="mt-[0.4vh] text-[1.1vw] text-muted">처리하면 그 즉시 일보에 기록됩니다.</div>
        </div>
      </div>

      <div className="absolute bottom-[3vh] left-[5vw] text-[1vw] font-body text-muted">
        03 / 34 · 1챕터 표지
      </div>
      <div className="absolute bottom-[3vh] right-[5vw] text-[1vw] font-body text-muted">
        관리의달인 · 관리소장 모드 매뉴얼
      </div>
    </SlideShell>
  );
}
