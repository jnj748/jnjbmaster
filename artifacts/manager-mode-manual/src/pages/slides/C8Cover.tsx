import { SlideShell, CoverHeader, CalloutPill } from "@/components/manual";

export default function C8Cover() {
  return (
    <SlideShell>
      <CoverHeader chapter={8} page={27} />

      <div className="absolute top-[16vh] left-[5vw] right-[5vw]">
        <div className="text-[1.5vw] font-display font-bold tracking-[0.2em] text-primary uppercase">
          8. 공유·인쇄 한눈에
        </div>
        <h1 className="mt-[1vh] font-display font-black text-ink tracking-tight text-[5vw] leading-[1.05]">
          ‘이미지·공유·인쇄’<br />어디서나 같은 위치, 같은 결과.
        </h1>
        <p className="mt-[2vh] text-[1.7vw] font-body font-medium text-muted max-w-[80vw]">
          일보·주보·월보·공고문 — 모두 <span className="text-ink font-bold">위쪽 같은 줄에 같은 버튼</span>이 있습니다.
          이 챕터에서는 카톡 공유, 인쇄, 그리고 자주 듣는 질문을 정리했습니다.
        </p>
      </div>

      <div className="absolute top-[55vh] left-[5vw] right-[5vw] grid grid-cols-2 gap-[1.5vw]">
        <div className="bg-surface border border-line rounded-2xl p-[1.6vw]">
          <CalloutPill text="보고서 (일보·주보·월보)" tone="primary" />
          <div className="mt-[1vh] text-[1.5vw] font-display font-bold text-ink">버튼 3개</div>
          <div className="mt-[0.4vh] text-[1.15vw] text-text">이미지로 저장 · 공유 · 인쇄</div>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-[1.6vw]">
          <CalloutPill text="공고문 템플릿" tone="accent" />
          <div className="mt-[1vh] text-[1.5vw] font-display font-bold text-ink">버튼 4개</div>
          <div className="mt-[0.4vh] text-[1.15vw] text-text">이미지 저장 · 공유 · 문서 저장(.docx) · 인쇄</div>
        </div>
      </div>

      <div className="absolute bottom-[8vh] left-[5vw] right-[5vw] bg-primary text-surface rounded-2xl p-[1.6vw]">
        <div className="text-[1.2vw] font-display font-bold tracking-[0.18em] uppercase opacity-80">
          공통 약속
        </div>
        <div className="mt-[0.6vh] text-[2vw] font-display font-black leading-tight">
          “버튼은 항상 화면 위쪽 한 줄, 같은 색, 같은 순서.”
        </div>
      </div>

      <div className="absolute bottom-[3vh] left-[5vw] text-[1vw] font-body text-muted">27 / 34 · 8챕터 표지</div>
      <div className="absolute bottom-[3vh] right-[5vw] text-[1vw] font-body text-muted">관리의달인 · 관리소장 모드 매뉴얼</div>
    </SlideShell>
  );
}
