import { SlideShell, PageHeader, BrowserShot, StepCard, FootBar, CalloutPill } from "@/components/manual";
import shot from "@/assets/screens/c7/desktop/templates.png";

export default function C8PrintDesktop() {
  return (
    <SlideShell>
      <PageHeader chapter={8} label="인쇄 — 컴퓨터" page={31} />

      <h1 className="absolute top-[12vh] left-[5vw] right-[5vw] font-display font-black text-ink tracking-tight text-[3.4vw] leading-[1.1]">
        컴퓨터에서 공고문·보고서 인쇄
      </h1>

      <div className="absolute top-[20vh] left-[5vw] right-[5vw] flex items-start gap-[2vw]">
        <BrowserShot src={shot} alt="컴퓨터 공지문 템플릿 — 카드 9개" widthVw={50} heightVh={62} />

        <div className="flex-1 flex flex-col gap-[1.2vh]">
          <CalloutPill text="크롬·엣지·웨일 모두 동일" tone="primary" />
          <StepCard n={1} title="‘인쇄’ 버튼을 누르면 PDF 미리보기" body="새 탭으로 PDF 미리보기가 열리고, 인쇄 다이얼로그가 자동으로 호출됩니다." />
          <StepCard n={2} title="용지·매수 확인" body="A4 / 한 장 / 컬러를 그대로 두시면 깔끔합니다. 게시판용은 ‘맞춤’으로 크게도 가능." />
          <StepCard n={3} title="‘인쇄’ 버튼 클릭" body="자동으로 잡힌 우리 사무실 프린터로 출력됩니다." />
          <StepCard n={4} title="자동 호출이 안 될 때" body="PDF 미리보기 화면 위쪽 ‘🖨 인쇄’ 아이콘을 직접 누르세요. 같은 결과입니다." highlight />
        </div>
      </div>

      <FootBar leftHint="31 / 34 · 8챕터 · 인쇄(컴퓨터)" />
    </SlideShell>
  );
}
