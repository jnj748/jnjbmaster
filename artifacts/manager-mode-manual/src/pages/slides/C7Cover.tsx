import { SlideShell, CoverHeader, MenuPath, CalloutPill } from "@/components/manual";

export default function C7Cover() {
  return (
    <SlideShell>
      <CoverHeader chapter={7} page={23} />

      <div className="absolute top-[16vh] left-[5vw] right-[5vw]">
        <div className="text-[1.5vw] font-display font-bold tracking-[0.2em] text-primary uppercase">
          7. 공고문 템플릿
        </div>
        <h1 className="mt-[1vh] font-display font-black text-ink tracking-tight text-[5vw] leading-[1.05]">
          단수 안내·소방훈련 안내…<br />몇 번만 눌러 공고문이 완성됩니다.
        </h1>
        <p className="mt-[2vh] text-[1.7vw] font-body font-medium text-muted max-w-[80vw]">
          템플릿을 고르면 <span className="text-ink font-bold">우리 건물 이름·주소·관리소장 이름·연락처</span>가 자동으로 채워집니다.
          빈 칸은 두세 가지(시간·동·호수)뿐. 그대로 이미지 저장·공유·문서 저장·인쇄가 됩니다.
        </p>
      </div>

      <div className="absolute top-[55vh] left-[5vw] right-[5vw] flex flex-wrap items-center gap-[1.2vw]">
        <MenuPath items={["사이드바", "든든하게 지키는 시설관리", "공지문 템플릿"]} />
        <CalloutPill text="모바일 ‘더보기’ 드로어에도 동일 메뉴" tone="accent" />
      </div>

      <div className="absolute bottom-[8vh] left-[5vw] right-[5vw] grid grid-cols-4 gap-[1.2vw]">
        <div className="bg-surface border border-line rounded-2xl px-[1.2vw] py-[1.4vh]">
          <div className="text-[1.05vw] font-display font-bold tracking-[0.18em] text-primary uppercase">안전</div>
          <div className="mt-[0.4vh] text-[1.3vw] font-display font-bold text-ink">불조심 / 소방훈련</div>
        </div>
        <div className="bg-surface border border-line rounded-2xl px-[1.2vw] py-[1.4vh]">
          <div className="text-[1.05vw] font-display font-bold tracking-[0.18em] text-primary uppercase">위생</div>
          <div className="mt-[0.4vh] text-[1.3vw] font-display font-bold text-ink">분리수거 / 소독</div>
        </div>
        <div className="bg-surface border border-line rounded-2xl px-[1.2vw] py-[1.4vh]">
          <div className="text-[1.05vw] font-display font-bold tracking-[0.18em] text-primary uppercase">공지</div>
          <div className="mt-[0.4vh] text-[1.3vw] font-display font-bold text-ink">단수·단전 / 층간소음</div>
        </div>
        <div className="bg-surface border border-line rounded-2xl px-[1.2vw] py-[1.4vh]">
          <div className="text-[1.05vw] font-display font-bold tracking-[0.18em] text-primary uppercase">일반</div>
          <div className="mt-[0.4vh] text-[1.3vw] font-display font-bold text-ink">에어컨 세척 / 차량등록</div>
        </div>
      </div>

      <div className="absolute bottom-[3vh] left-[5vw] text-[1vw] font-body text-muted">23 / 34 · 7챕터 표지</div>
      <div className="absolute bottom-[3vh] right-[5vw] text-[1vw] font-body text-muted">관리의달인 · 관리소장 모드 매뉴얼</div>
    </SlideShell>
  );
}
