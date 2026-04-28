import { SlideShell, PageHeader, BrowserShot, StepCard, FootBar, MenuPath } from "@/components/manual";
import shot from "@/assets/screens/c7/desktop/templates.png";

export default function C7Desktop() {
  return (
    <SlideShell>
      <PageHeader chapter={7} label="컴퓨터에서 공고문" page={25} />

      <h1 className="absolute top-[12vh] left-[5vw] right-[5vw] font-display font-black text-ink tracking-tight text-[3.4vw] leading-[1.1]">
        공고문 템플릿 · 컴퓨터에서 큰 화면으로
      </h1>

      <div className="absolute top-[20vh] left-[5vw] right-[5vw] flex items-start gap-[2vw]">
        <BrowserShot src={shot} alt="컴퓨터 공지문 템플릿 — 사이드바 ‘공지문 템플릿’ 강조, 9개 템플릿 카드" widthVw={56} />

        <div className="flex-1 flex flex-col gap-[1.2vh]">
          <MenuPath items={["사이드바", "든든하게 지키는 시설관리", "공지문 템플릿"]} />
          <StepCard n={1} title="사이드바에서 ‘공지문 템플릿’ 클릭" body="‘든든하게 지키는 시설관리’ 그룹의 마지막 줄에 있습니다." />
          <StepCard n={2} title="3 × 3 카드 중 하나 클릭" body="각 카드 위쪽에 ‘안전/위생/공지/일반’ 분류 배지가 있습니다." />
          <StepCard n={3} title="다이얼로그 안에서 미리보기" body="A4 크기 미리보기에 우리 건물 정보가 이미 들어가 있습니다." />
          <StepCard n={4} title="아래 버튼 4개로 마무리" body="‘이미지 저장 / 공유 / 문서 저장(.docx) / 인쇄’ — 다음 슬라이드에서 자세히." highlight />
        </div>
      </div>

      <FootBar leftHint="25 / 34 · 7챕터 · 컴퓨터" rightHint="실제 앱 화면 캡처" />
    </SlideShell>
  );
}
