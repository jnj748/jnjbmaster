import { SlideShell, CoverHeader, MenuPath, CalloutPill } from "@/components/manual";

export default function C6Cover() {
  return (
    <SlideShell>
      <CoverHeader chapter={6} page={20} />

      <div className="absolute top-[16vh] left-[5vw] right-[5vw]">
        <div className="text-[1.5vw] font-display font-bold tracking-[0.2em] text-primary uppercase">
          6. 월보(자동)
        </div>
        <h1 className="mt-[1vh] font-display font-black text-ink tracking-tight text-[5vw] leading-[1.05]">
          한 달 주보가 모이면<br />월보가 자동으로 만들어집니다.
        </h1>
        <p className="mt-[2vh] text-[1.7vw] font-body font-medium text-muted max-w-[80vw]">
          한 달 동안의 주보를 모아 <span className="text-ink font-bold">월간 요약·완료율 그래프·다음 달 권장 업무</span>가 함께 정리됩니다.
          매월 첫 월요일 아침에 ‘월보(자동)’ 탭에 새 보고서가 올라옵니다.
        </p>
      </div>

      <div className="absolute top-[55vh] left-[5vw] right-[5vw] flex flex-wrap items-center gap-[1.2vw]">
        <MenuPath items={["사이드바", "차곡차곡 쌓는 보고·전자결재", "업무일지", "월보(자동)"]} />
        <CalloutPill text="모바일 [일지] → ‘월보(자동)’ 탭" tone="accent" />
      </div>

      <div className="absolute bottom-[8vh] left-[5vw] right-[5vw] grid grid-cols-3 gap-[1.5vw]">
        <div className="bg-surface border border-line rounded-2xl px-[1.4vw] py-[1.6vh]">
          <div className="text-[1.1vw] font-display font-bold tracking-[0.18em] text-primary uppercase">언제 만들어지나</div>
          <div className="mt-[0.6vh] text-[1.5vw] font-display font-bold text-ink">매월 1일 06:00</div>
          <div className="mt-[0.4vh] text-[1.1vw] text-muted">전월 마감 후 자동 생성.</div>
        </div>
        <div className="bg-surface border border-line rounded-2xl px-[1.4vw] py-[1.6vh]">
          <div className="text-[1.1vw] font-display font-bold tracking-[0.18em] text-primary uppercase">담겨 있는 것</div>
          <div className="mt-[0.6vh] text-[1.5vw] font-display font-bold text-ink">완료율·민원·재무</div>
          <div className="mt-[0.4vh] text-[1.1vw] text-muted">전월 대비 변동 화살표 함께.</div>
        </div>
        <div className="bg-surface border border-line rounded-2xl px-[1.4vw] py-[1.6vh]">
          <div className="text-[1.1vw] font-display font-bold tracking-[0.18em] text-primary uppercase">결재 상신</div>
          <div className="mt-[0.6vh] text-[1.5vw] font-display font-bold text-ink">본부장 → 사장</div>
          <div className="mt-[0.4vh] text-[1.1vw] text-muted">두 단계 결재함으로 자동 분배.</div>
        </div>
      </div>

      <div className="absolute bottom-[3vh] left-[5vw] text-[1vw] font-body text-muted">20 / 34 · 6챕터 표지</div>
      <div className="absolute bottom-[3vh] right-[5vw] text-[1vw] font-body text-muted">관리의달인 · 관리소장 모드 매뉴얼</div>
    </SlideShell>
  );
}
