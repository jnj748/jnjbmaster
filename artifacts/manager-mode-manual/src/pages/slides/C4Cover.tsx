import { SlideShell, CoverHeader, MenuPath, CalloutPill } from "@/components/manual";

export default function C4Cover() {
  return (
    <SlideShell>
      <CoverHeader chapter={4} page={13} />

      <div className="absolute top-[16vh] left-[5vw] right-[5vw]">
        <div className="text-[1.5vw] font-display font-bold tracking-[0.2em] text-primary uppercase">
          4. 일지(일보) 만들기
        </div>
        <h1 className="mt-[1vh] font-display font-black text-ink tracking-tight text-[5vw] leading-[1.05]">
          하루 자료를 모아<br />‘일일 업무보고서’가 자동으로 완성됩니다.
        </h1>
        <p className="mt-[2vh] text-[1.7vw] font-body font-medium text-muted max-w-[80vw]">
          필수·제안업무·업무기록·법정점검까지 <span className="text-ink font-bold">하루 동안 들어온 모든 기록</span>이
          정해진 양식의 <span className="text-ink font-bold">‘일일 업무보고서’</span>로 합쳐집니다. 글씨를 처음부터 칠 필요가 없습니다.
        </p>
      </div>

      <div className="absolute top-[55vh] left-[5vw] right-[5vw] flex flex-wrap items-center gap-[1.2vw]">
        <MenuPath items={["사이드바", "차곡차곡 쌓는 보고·전자결재", "업무일지", "일보"]} />
        <CalloutPill text="모바일 하단 [일지] → [일보] 탭" tone="accent" />
      </div>

      <div className="absolute bottom-[8vh] left-[5vw] right-[5vw] grid grid-cols-3 gap-[1.5vw]">
        <div className="bg-surface border border-line rounded-2xl px-[1.4vw] py-[1.6vh]">
          <div className="text-[1.1vw] font-display font-bold tracking-[0.18em] text-primary uppercase">자동으로 들어오는 것</div>
          <div className="mt-[0.6vh] text-[1.5vw] font-display font-bold text-ink">완료/연기/기록</div>
          <div className="mt-[0.4vh] text-[1.1vw] text-muted">손으로 옮길 필요 없습니다.</div>
        </div>
        <div className="bg-surface border border-line rounded-2xl px-[1.4vw] py-[1.6vh]">
          <div className="text-[1.1vw] font-display font-bold tracking-[0.18em] text-primary uppercase">소장이 더할 것</div>
          <div className="mt-[0.6vh] text-[1.5vw] font-display font-bold text-ink">‘일일 일지’ 한 줄</div>
          <div className="mt-[0.4vh] text-[1.1vw] text-muted">오늘 본부에 알릴 한 마디.</div>
        </div>
        <div className="bg-surface border border-line rounded-2xl px-[1.4vw] py-[1.6vh]">
          <div className="text-[1.1vw] font-display font-bold tracking-[0.18em] text-primary uppercase">마감</div>
          <div className="mt-[0.6vh] text-[1.5vw] font-display font-bold text-ink">‘일지 작성’ 클릭</div>
          <div className="mt-[0.4vh] text-[1.1vw] text-muted">버튼 한 번이면 그날 일지가 잠깁니다.</div>
        </div>
      </div>

      <div className="absolute bottom-[3vh] left-[5vw] text-[1vw] font-body text-muted">13 / 34 · 4챕터 표지</div>
      <div className="absolute bottom-[3vh] right-[5vw] text-[1vw] font-body text-muted">관리의달인 · 관리소장 모드 매뉴얼</div>
    </SlideShell>
  );
}
