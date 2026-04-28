import { SlideShell, CoverHeader, MenuPath, CalloutPill } from "@/components/manual";

export default function C5Cover() {
  return (
    <SlideShell>
      <CoverHeader chapter={5} page={17} />

      <div className="absolute top-[16vh] left-[5vw] right-[5vw]">
        <div className="text-[1.5vw] font-display font-bold tracking-[0.2em] text-primary uppercase">
          5. 주보(자동)
        </div>
        <h1 className="mt-[1vh] font-display font-black text-ink tracking-tight text-[5vw] leading-[1.05]">
          한 주 일보가 모이면<br />주보가 자동으로 만들어집니다.
        </h1>
        <p className="mt-[2vh] text-[1.7vw] font-body font-medium text-muted max-w-[80vw]">
          탭 이름이 <span className="text-ink font-bold">‘주보(자동)’</span>인 이유 — 소장이 새로 글을 쓸 일이 거의 없습니다.
          한 주 동안의 일보 7장을 한 장으로 합치고, 주간 요약·완료율·미완료 사유를 자동 정리합니다.
        </p>
      </div>

      <div className="absolute top-[55vh] left-[5vw] right-[5vw] flex flex-wrap items-center gap-[1.2vw]">
        <MenuPath items={["사이드바", "차곡차곡 쌓는 보고·전자결재", "업무일지", "주보(자동)"]} />
        <CalloutPill text="모바일 [일지] → ‘주보(자동)’ 탭" tone="accent" />
      </div>

      <div className="absolute bottom-[8vh] left-[5vw] right-[5vw] grid grid-cols-3 gap-[1.5vw]">
        <div className="bg-surface border border-line rounded-2xl px-[1.4vw] py-[1.6vh]">
          <div className="text-[1.1vw] font-display font-bold tracking-[0.18em] text-primary uppercase">언제 만들어지나</div>
          <div className="mt-[0.6vh] text-[1.5vw] font-display font-bold text-ink">매주 일요일 22:00</div>
          <div className="mt-[0.4vh] text-[1.1vw] text-muted">월요일 아침에 보면 됩니다.</div>
        </div>
        <div className="bg-surface border border-line rounded-2xl px-[1.4vw] py-[1.6vh]">
          <div className="text-[1.1vw] font-display font-bold tracking-[0.18em] text-primary uppercase">소장이 더할 것</div>
          <div className="mt-[0.6vh] text-[1.5vw] font-display font-bold text-ink">‘주간 코멘트’ 한 줄</div>
          <div className="mt-[0.4vh] text-[1.1vw] text-muted">없으면 비워두셔도 됩니다.</div>
        </div>
        <div className="bg-surface border border-line rounded-2xl px-[1.4vw] py-[1.6vh]">
          <div className="text-[1.1vw] font-display font-bold tracking-[0.18em] text-primary uppercase">자동 결재 상신</div>
          <div className="mt-[0.6vh] text-[1.5vw] font-display font-bold text-ink">본부장 결재함으로</div>
          <div className="mt-[0.4vh] text-[1.1vw] text-muted">‘결재 상신’이 함께 만들어집니다.</div>
        </div>
      </div>

      <div className="absolute bottom-[3vh] left-[5vw] text-[1vw] font-body text-muted">17 / 34 · 5챕터 표지</div>
      <div className="absolute bottom-[3vh] right-[5vw] text-[1vw] font-body text-muted">관리의달인 · 관리소장 모드 매뉴얼</div>
    </SlideShell>
  );
}
