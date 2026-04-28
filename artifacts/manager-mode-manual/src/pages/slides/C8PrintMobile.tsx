import { SlideShell, PageHeader, PhoneShot, StepCard, FootBar, CalloutPill } from "@/components/manual";
import shot from "@/assets/screens/c7/mobile/templates.png";

export default function C8PrintMobile() {
  return (
    <SlideShell>
      <PageHeader chapter={8} label="인쇄 — 스마트폰" page={30} />

      <h1 className="absolute top-[12vh] left-[5vw] right-[5vw] font-display font-black text-ink tracking-tight text-[3.4vw] leading-[1.1]">
        스마트폰만으로 게시판용 공고문 인쇄
      </h1>

      <div className="absolute top-[20vh] left-[5vw] right-[5vw] flex items-start gap-[2vw]">
        <PhoneShot src={shot} alt="모바일 공지문 템플릿 카드 목록" widthVw={22} heightVh={70} />

        <div className="flex-1 flex flex-col gap-[1.2vh]">
          <CalloutPill text="우리 건물 프린터가 있는 사무실에서" tone="primary" />
          <StepCard n={1} title="공고문 템플릿을 연다" body="‘더보기 › 공지문 템플릿’ → 원하는 카드 선택. 빈 칸 두세 개만 채웁니다." />
          <StepCard n={2} title="아래 ‘인쇄’ 버튼" body="버튼 4개 중 가장 오른쪽 ‘🖨 인쇄’를 누릅니다." />
          <StepCard n={3} title="안드로이드 — 바로 프린터 선택 화면" body="블루투스·와이파이로 연결된 프린터를 골라 인쇄합니다." />
          <StepCard n={4} title="아이폰 — PDF 저장 후 인쇄" body="‘저장된 PDF 파일을 열어 인쇄해 주세요’ 알림이 뜹니다. 다운로드 폴더 PDF를 한 번 누르면 인쇄 화면." highlight />
        </div>
      </div>

      <FootBar leftHint="30 / 34 · 8챕터 · 인쇄(모바일)" />
    </SlideShell>
  );
}
