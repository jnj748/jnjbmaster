import { SlideShell, PageHeader, StepCard, FootBar, CalloutPill } from "@/components/manual";

export default function C2Outcome() {
  return (
    <SlideShell>
      <PageHeader chapter={2} label="제안업무 처리 결과" page={9} />

      <h1 className="absolute top-[12vh] left-[5vw] right-[5vw] font-display font-black text-ink tracking-tight text-[3.4vw] leading-[1.1]">
        제안업무를 처리하면 어디에 남나요?
      </h1>

      <div className="absolute top-[26vh] left-[5vw] right-[5vw] grid grid-cols-3 gap-[1.5vw]">
        <div className="bg-surface border border-line rounded-2xl p-[1.6vw] flex flex-col">
          <CalloutPill text="처리" tone="success" />
          <div className="mt-[1.2vh] text-[1.6vw] font-display font-bold text-ink">일보의 ‘제안업무’ 줄</div>
          <div className="mt-[0.8vh] text-[1.15vw] font-body text-text leading-snug">
            오늘 일보에 ‘완료된 제안업무’로 자동 추가되고, 사진·메모도 같이 들어갑니다.
          </div>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-[1.6vw] flex flex-col">
          <CalloutPill text="연기" tone="accent" />
          <div className="mt-[1.2vh] text-[1.6vw] font-display font-bold text-ink">다음 권장 시점으로 이동</div>
          <div className="mt-[0.8vh] text-[1.15vw] font-body text-text leading-snug">
            ‘다음 주’·‘다음 달’ 중 하나를 고르면 그날까지 목록 위쪽에서 사라졌다가 다시 올라옵니다.
          </div>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-[1.6vw] flex flex-col">
          <CalloutPill text="제외" tone="primary" />
          <div className="mt-[1.2vh] text-[1.6vw] font-display font-bold text-ink">우리 건물엔 안 함</div>
          <div className="mt-[0.8vh] text-[1.15vw] font-body text-text leading-snug">
            예: 옥상 정원이 없는 건물의 ‘옥상 정원 정비’. 한 번 빼두면 다시 권장되지 않습니다.
          </div>
        </div>
      </div>

      <div className="absolute bottom-[12vh] left-[5vw] right-[5vw] bg-primary-soft border border-primary/30 rounded-2xl p-[1.8vw]">
        <StepCard
          n={0}
          title="견적이 필요한 일이라면?"
          body="제안업무에서도 ‘견적 요청’으로 바로 전환할 수 있습니다. 분야가 맞는 협력업체에 자동 발송됩니다."
        />
      </div>

      <FootBar leftHint="09 / 34 · 2챕터 · 결과" />
    </SlideShell>
  );
}
