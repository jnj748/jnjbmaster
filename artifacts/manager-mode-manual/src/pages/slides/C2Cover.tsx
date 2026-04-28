import { SlideShell, CoverHeader, MenuPath, CalloutPill } from "@/components/manual";

export default function C2Cover() {
  return (
    <SlideShell>
      <CoverHeader chapter={2} page={7} />

      <div className="absolute top-[16vh] left-[5vw] right-[5vw]">
        <div className="text-[1.5vw] font-display font-bold tracking-[0.2em] text-primary uppercase">
          2. 제안업무 처리
        </div>
        <h1 className="mt-[1vh] font-display font-black text-ink tracking-tight text-[5vw] leading-[1.05]">
          꼭 해야 하는 건 아니지만,<br />지금 시기에 권장되는 일.
        </h1>
        <p className="mt-[2vh] text-[1.7vw] font-body font-medium text-muted max-w-[80vw]">
          냉방기 시운전·옥상 점검·낙엽 청소처럼 <span className="text-ink font-bold">계절·일정에 맞춰 권장되는 업무</span>를
          AI가 모아 둡니다. 기한 초과는 없지만, 미루면 다음 달 보고서에서 지적됩니다.
        </p>
      </div>

      <div className="absolute top-[55vh] left-[5vw] right-[5vw] flex flex-wrap items-center gap-[1.2vw]">
        <MenuPath items={["사이드바", "든든하게 지키는 시설관리", "제안업무"]} />
        <CalloutPill text="홈 ‘제안업무현황’ 카드에서도 진입" tone="accent" />
      </div>

      <div className="absolute bottom-[8vh] left-[5vw] right-[5vw] grid grid-cols-3 gap-[1.5vw]">
        <div className="bg-surface border border-line rounded-2xl px-[1.4vw] py-[1.6vh]">
          <div className="text-[1.1vw] font-display font-bold tracking-[0.18em] text-primary uppercase">필수업무와 차이</div>
          <div className="mt-[0.6vh] text-[1.5vw] font-display font-bold text-ink">기한 초과 X</div>
          <div className="mt-[0.4vh] text-[1.1vw] text-muted">단, ‘D-7’처럼 권장 시점이 표시됩니다.</div>
        </div>
        <div className="bg-surface border border-line rounded-2xl px-[1.4vw] py-[1.6vh]">
          <div className="text-[1.1vw] font-display font-bold tracking-[0.18em] text-primary uppercase">자동 보고</div>
          <div className="mt-[0.6vh] text-[1.5vw] font-display font-bold text-ink">완료 시 일보 반영</div>
          <div className="mt-[0.4vh] text-[1.1vw] text-muted">필수업무와 같은 방식으로 보고서에 들어갑니다.</div>
        </div>
        <div className="bg-surface border border-line rounded-2xl px-[1.4vw] py-[1.6vh]">
          <div className="text-[1.1vw] font-display font-bold tracking-[0.18em] text-primary uppercase">‘제외’도 가능</div>
          <div className="mt-[0.6vh] text-[1.5vw] font-display font-bold text-ink">우리 건물 사정</div>
          <div className="mt-[0.4vh] text-[1.1vw] text-muted">맞지 않으면 ‘이번엔 안 함’으로 빼둘 수 있습니다.</div>
        </div>
      </div>

      <div className="absolute bottom-[3vh] left-[5vw] text-[1vw] font-body text-muted">07 / 34 · 2챕터 표지</div>
      <div className="absolute bottom-[3vh] right-[5vw] text-[1vw] font-body text-muted">관리의달인 · 관리소장 모드 매뉴얼</div>
    </SlideShell>
  );
}
