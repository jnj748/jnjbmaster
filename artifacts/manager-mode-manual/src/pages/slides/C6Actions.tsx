import { SlideShell, PageHeader, FootBar, CalloutPill, StepCard } from "@/components/manual";

export default function C6Actions() {
  return (
    <SlideShell>
      <PageHeader chapter={6} label="월보의 ‘이미지·공유·인쇄’" page={22} />

      <h1 className="absolute top-[12vh] left-[5vw] right-[5vw] font-display font-black text-ink tracking-tight text-[3.4vw] leading-[1.1]">
        월보를 본부·입주자대표회의에 전하기
      </h1>

      <div className="absolute top-[26vh] left-[5vw] right-[5vw] grid grid-cols-3 gap-[1.5vw]">
        <div className="bg-surface border border-line rounded-2xl p-[1.6vw]">
          <CalloutPill text="이미지로 저장" tone="primary" />
          <div className="mt-[1.2vh] text-[1.6vw] font-display font-bold text-ink">한 장 PNG</div>
          <div className="mt-[0.6vh] text-[1.15vw] text-text leading-snug">표·그래프까지 그대로 한 장에 들어갑니다. 카톡·메일 첨부에 적합.</div>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-[1.6vw]">
          <CalloutPill text="공유" tone="accent" />
          <div className="mt-[1.2vh] text-[1.6vw] font-display font-bold text-ink">대표회의 카톡방</div>
          <div className="mt-[0.6vh] text-[1.15vw] text-text leading-snug">스마트폰 공유 시트에서 입주자 대표회의 단톡방을 선택해 즉시 보내기.</div>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-[1.6vw]">
          <CalloutPill text="인쇄" tone="success" />
          <div className="mt-[1.2vh] text-[1.6vw] font-display font-bold text-ink">A4 한 장</div>
          <div className="mt-[0.6vh] text-[1.15vw] text-text leading-snug">대표회의장 회의 자료로 사용. 컬러 그래프가 깔끔하게 나옵니다.</div>
        </div>
      </div>

      <div className="absolute bottom-[10vh] left-[5vw] right-[5vw] bg-primary-soft border border-primary/30 rounded-2xl p-[1.4vw]">
        <StepCard
          n={0}
          title="자료 보존 — 별도 저장은 필요 없습니다"
          body="월보는 시스템에 자동 보관됩니다. ‘이미지로 저장’은 본부에 보낼 용도, 시스템 안에는 그대로 남아 있습니다."
        />
      </div>

      <FootBar leftHint="22 / 34 · 6챕터 · 액션" />
    </SlideShell>
  );
}
