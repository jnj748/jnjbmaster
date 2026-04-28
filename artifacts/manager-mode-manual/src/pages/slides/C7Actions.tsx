import { SlideShell, PageHeader, FootBar, CalloutPill, StepCard } from "@/components/manual";

export default function C7Actions() {
  return (
    <SlideShell>
      <PageHeader chapter={7} label="공고문의 4가지 보내기" page={26} />

      <h1 className="absolute top-[12vh] left-[5vw] right-[5vw] font-display font-black text-ink tracking-tight text-[3.4vw] leading-[1.1]">
        공고문은 보고서와 다르게 ‘문서 저장(.docx)’이 더 있습니다
      </h1>

      <div className="absolute top-[26vh] left-[5vw] right-[5vw] grid grid-cols-4 gap-[1.4vw]">
        <div className="bg-surface border border-line rounded-2xl p-[1.4vw]">
          <CalloutPill text="이미지 저장" tone="primary" />
          <div className="mt-[1vh] text-[1.4vw] font-display font-bold text-ink">PNG 한 장</div>
          <div className="mt-[0.5vh] text-[1.05vw] text-text leading-snug">엘리베이터 게시판에 그대로 붙여 인쇄 가능. 카톡 공유에 최적.</div>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-[1.4vw]">
          <CalloutPill text="공유" tone="accent" />
          <div className="mt-[1vh] text-[1.4vw] font-display font-bold text-ink">단톡방으로 즉시</div>
          <div className="mt-[0.5vh] text-[1.05vw] text-text leading-snug">스마트폰 공유 시트로 카톡·문자 선택. 입주민 단톡방에 바로 보내기.</div>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-[1.4vw]">
          <CalloutPill text="문서 저장" tone="success" />
          <div className="mt-[1vh] text-[1.4vw] font-display font-bold text-ink">한글·워드 .docx</div>
          <div className="mt-[0.5vh] text-[1.05vw] text-text leading-snug">한글에서 열어 글자 수정·로고 교체 가능. 다른 양식으로 변형할 때.</div>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-[1.4vw]">
          <CalloutPill text="인쇄" tone="primary" />
          <div className="mt-[1vh] text-[1.4vw] font-display font-bold text-ink">바로 프린터로</div>
          <div className="mt-[0.5vh] text-[1.05vw] text-text leading-snug">PDF 미리보기 후 인쇄. 게시판용은 ‘여러 장’ 대신 ‘한 장’ 옵션 권장.</div>
        </div>
      </div>

      <div className="absolute bottom-[10vh] left-[5vw] right-[5vw] bg-primary-soft border border-primary/30 rounded-2xl p-[1.4vw]">
        <StepCard
          n={0}
          title="아이폰의 인쇄·공유"
          body="‘인쇄’와 ‘공유’ 모두 PDF 다운로드로 바뀝니다. 다운로드 폴더의 PDF 파일을 한 번만 더 누르면 인쇄·공유 시트가 나옵니다."
        />
      </div>

      <FootBar leftHint="26 / 34 · 7챕터 · 액션" />
    </SlideShell>
  );
}
