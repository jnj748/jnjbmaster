import { SlideShell, PageHeader, PhoneShot, StepCard, FootBar, CalloutPill } from "@/components/manual";
import shot from "@/assets/screens/c4/mobile/daily.png";

export default function C8KakaoMobile() {
  return (
    <SlideShell>
      <PageHeader chapter={8} label="카톡 공유 — 스마트폰" page={28} />

      <h1 className="absolute top-[12vh] left-[5vw] right-[5vw] font-display font-black text-ink tracking-tight text-[3.4vw] leading-[1.1]">
        스마트폰에서 일보·주보를 카톡으로 보내기
      </h1>

      <div className="absolute top-[20vh] left-[5vw] right-[5vw] flex items-start gap-[2vw]">
        <PhoneShot src={shot} alt="모바일 일보 — 위쪽 ‘이미지로 저장 / 공유 / 인쇄’ 버튼" widthVw={22} heightVh={70} />

        <div className="flex-1 flex flex-col gap-[1.2vh]">
          <CalloutPill text="안드로이드도 아이폰도 같은 순서" tone="primary" />
          <StepCard n={1} title="보고서를 연다" body="일보 / 주보(자동) / 월보(자동) 중 하나를 누르면 화면 위쪽에 버튼 줄이 보입니다." />
          <StepCard n={2} title="가운데 ‘공유’ 버튼" body="가운데 ‘공유’를 누르면 스마트폰 공유 시트가 올라옵니다." />
          <StepCard n={3} title="‘카카오톡’ 선택" body="공유 시트에서 카카오톡 아이콘을 누르고 보낼 친구·단톡방을 고릅니다." />
          <StepCard n={4} title="아이폰은 PDF가 다운로드됨" body="아이폰에서는 다운로드 폴더에 PDF가 저장됩니다. 그 파일을 카톡에서 ‘+ 첨부’로 첨부하시면 됩니다." highlight />
        </div>
      </div>

      <FootBar leftHint="28 / 34 · 8챕터 · 카톡(모바일)" />
    </SlideShell>
  );
}
