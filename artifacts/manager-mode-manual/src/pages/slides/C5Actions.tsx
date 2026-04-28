import { SlideShell, PageHeader, FootBar, CalloutPill, StepCard } from "@/components/manual";

export default function C5Actions() {
  return (
    <SlideShell>
      <PageHeader chapter={5} label="주보의 ‘이미지·공유·인쇄’" page={19} />

      <h1 className="absolute top-[12vh] left-[5vw] right-[5vw] font-display font-black text-ink tracking-tight text-[3.4vw] leading-[1.1]">
        주보를 다른 사람에게 보내려면
      </h1>

      <div className="absolute top-[26vh] left-[5vw] right-[5vw] grid grid-cols-3 gap-[1.5vw]">
        <div className="bg-surface border border-line rounded-2xl p-[1.6vw]">
          <CalloutPill text="이미지로 저장" tone="primary" />
          <div className="mt-[1.2vh] text-[1.6vw] font-display font-bold text-ink">PNG 한 장</div>
          <div className="mt-[0.6vh] text-[1.15vw] text-text leading-snug">‘다운로드’ 폴더에 ‘주보_2026-W17.png’이 저장됩니다. 그대로 카톡 첨부.</div>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-[1.6vw]">
          <CalloutPill text="공유" tone="accent" />
          <div className="mt-[1.2vh] text-[1.6vw] font-display font-bold text-ink">스마트폰 공유 시트</div>
          <div className="mt-[0.6vh] text-[1.15vw] text-text leading-snug">카카오톡·문자 등 원하는 앱 선택. 안드로이드는 즉시, 아이폰은 PDF 다운로드 후 사용자가 공유.</div>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-[1.6vw]">
          <CalloutPill text="인쇄" tone="success" />
          <div className="mt-[1.2vh] text-[1.6vw] font-display font-bold text-ink">바로 프린터로</div>
          <div className="mt-[0.6vh] text-[1.15vw] text-text leading-snug">PDF 미리보기 후 인쇄. 우리 건물 인쇄 양식대로 한 장에 깔끔하게 나옵니다.</div>
        </div>
      </div>

      <div className="absolute bottom-[10vh] left-[5vw] right-[5vw] bg-primary-soft border border-primary/30 rounded-2xl p-[1.4vw]">
        <StepCard n={0} title="아이폰을 쓰신다면" body="‘공유’와 ‘인쇄’를 누르면 우선 PDF가 다운로드됩니다. 다운로드된 파일을 한 번만 누르면 같은 결과가 나옵니다." />
      </div>

      <FootBar leftHint="19 / 34 · 5챕터 · 액션" />
    </SlideShell>
  );
}
