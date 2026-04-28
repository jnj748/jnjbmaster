import { SlideShell, PageHeader, StepCard, FootBar, CalloutPill } from "@/components/manual";

export default function C1Outcome() {
  return (
    <SlideShell>
      <PageHeader chapter={1} label="처리 결과가 보고서로" page={6} />

      <h1 className="absolute top-[12vh] left-[5vw] right-[5vw] font-display font-black text-ink tracking-tight text-[3.4vw] leading-[1.1]">
        한 번 처리하면, 일보·주보·월보까지 자동으로 들어갑니다
      </h1>

      <div className="absolute top-[26vh] left-[5vw] right-[5vw] grid grid-cols-3 gap-[1.5vw]">
        <div className="bg-surface border border-line rounded-2xl p-[1.6vw] flex flex-col">
          <CalloutPill text="완료" tone="success" />
          <div className="mt-[1.2vh] text-[1.6vw] font-display font-bold text-ink">완료 보고</div>
          <div className="mt-[0.8vh] text-[1.15vw] font-body text-text leading-snug">
            처리 일자·사진·메모가 그대로 일보의 <span className="font-bold">‘완료된 필수업무’</span> 줄에
            추가됩니다. 별도 입력은 필요하지 않습니다.
          </div>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-[1.6vw] flex flex-col">
          <CalloutPill text="연기" tone="accent" />
          <div className="mt-[1.2vh] text-[1.6vw] font-display font-bold text-ink">사유서 자동 생성</div>
          <div className="mt-[0.8vh] text-[1.15vw] font-body text-text leading-snug">
            ‘연기’를 고르고 사유를 한 줄 적으면 <span className="font-bold">사유서 초안</span>이 결재 상신함에
            대기합니다. 그대로 본부장께 올리면 됩니다.
          </div>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-[1.6vw] flex flex-col">
          <CalloutPill text="견적 요청" tone="primary" />
          <div className="mt-[1.2vh] text-[1.6vw] font-display font-bold text-ink">파트너에게 자동 발송</div>
          <div className="mt-[0.8vh] text-[1.15vw] font-body text-text leading-snug">
            우리 건물에 등록된 협력업체 중 <span className="font-bold">분야가 맞는 곳</span>으로
            견적 요청서가 자동 발송됩니다. 받은 견적은 견적함에서 비교합니다.
          </div>
        </div>
      </div>

      <div className="absolute bottom-[12vh] left-[5vw] right-[5vw] bg-primary-soft border border-primary/30 rounded-2xl p-[1.8vw]">
        <div className="text-[1.2vw] font-display font-bold tracking-[0.18em] text-primary uppercase">
          외워두실 한 줄
        </div>
        <div className="mt-[0.6vh] text-[2vw] font-display font-black text-ink leading-tight">
          “필수업무는 <span className="text-primary">한 번 처리</span>하면, 보고서가 <span className="text-primary">알아서 채워집니다.</span>”
        </div>
      </div>

      <FootBar leftHint="06 / 34 · 1챕터 · 결과" />
    </SlideShell>
  );
}
