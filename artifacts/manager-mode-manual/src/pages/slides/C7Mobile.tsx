import { SlideShell, PageHeader, PhoneShot, StepCard, FootBar, MenuPath } from "@/components/manual";
import shot from "@/assets/screens/c7/mobile/templates.png";

export default function C7Mobile() {
  return (
    <SlideShell>
      <PageHeader chapter={7} label="스마트폰에서 공고문" page={24} />

      <h1 className="absolute top-[12vh] left-[5vw] right-[5vw] font-display font-black text-ink tracking-tight text-[3.4vw] leading-[1.1]">
        공고문 템플릿 · 스마트폰에서 만들기
      </h1>

      <div className="absolute top-[20vh] left-[5vw] right-[5vw] flex items-start gap-[2vw]">
        <PhoneShot src={shot} alt="모바일 공지문 템플릿 — 안전/위생/공지/일반 카테고리" widthVw={22} heightVh={70} />

        <div className="flex-1 flex flex-col gap-[1.2vh]">
          <MenuPath items={["하단 ‘더보기’", "공지문 템플릿"]} />
          <StepCard n={1} title="‘더보기’ → ‘공지문 템플릿’" body="하단 우측 ‘☰ 더보기’를 누르고 ‘공지문 템플릿’을 선택합니다." />
          <StepCard n={2} title="카테고리로 좁히기" body="‘전체 / 안전 / 위생 / 공지 / 일반’ 중 골라 누르면 해당 템플릿만 보입니다." />
          <StepCard n={3} title="원하는 템플릿 선택" body="예: ‘단수/단전 사전 안내’. 카드 자체를 누르면 미리보기 다이얼로그가 열립니다." />
          <StepCard n={4} title="빈 칸만 채우면 끝" body="시간·동·호수 같은 두세 칸만 입력. 우리 건물 정보는 자동으로 채워져 있습니다." highlight />
        </div>
      </div>

      <FootBar leftHint="24 / 34 · 7챕터 · 모바일" rightHint="실제 앱 화면 캡처" />
    </SlideShell>
  );
}
