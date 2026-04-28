import { SlideShell, PageHeader, BrowserShot, StepCard, FootBar, CalloutPill } from "@/components/manual";
import shot from "@/assets/screens/c4/desktop/daily.png";

export default function C8KakaoDesktop() {
  return (
    <SlideShell>
      <PageHeader chapter={8} label="카톡 공유 — 컴퓨터" page={29} />

      <h1 className="absolute top-[12vh] left-[5vw] right-[5vw] font-display font-black text-ink tracking-tight text-[3.4vw] leading-[1.1]">
        컴퓨터에서 일보를 카톡으로 보내기
      </h1>

      <div className="absolute top-[20vh] left-[5vw] right-[5vw] flex items-start gap-[2vw]">
        <BrowserShot src={shot} alt="컴퓨터 일보 위쪽 버튼 — 이미지로 저장 / 공유 / 인쇄" widthVw={50} heightVh={62} />

        <div className="flex-1 flex flex-col gap-[1.2vh]">
          <CalloutPill text="컴퓨터엔 ‘공유 시트’가 없으니 두 가지 방법" tone="primary" />
          <StepCard n={1} title="① 가장 쉬운 방법 — ‘이미지로 저장’ 후 카톡PC에 끌어다 놓기" body="왼쪽 ‘이미지로 저장’ → 다운로드 폴더 → 카톡PC 채팅창에 드래그." />
          <StepCard n={2} title="② 인쇄용 PDF로 보내기" body="‘인쇄’ 버튼은 PDF 미리보기를 띄웁니다. 거기서 ‘다른 이름으로 저장’ → 카톡PC에 첨부." />
          <StepCard n={3} title="공유 버튼은 스마트폰에서 더 편합니다" body="컴퓨터의 ‘공유’ 버튼은 PDF만 내려받습니다. 카톡 PC에서 직접 첨부하셔야 해요." />
          <StepCard n={4} title="대표회의 단톡방엔 PNG가 무난" body="여러 사람이 보는 단톡방은 ‘이미지로 저장(PNG)’이 모바일에서 가장 잘 보입니다." highlight />
        </div>
      </div>

      <FootBar leftHint="29 / 34 · 8챕터 · 카톡(컴퓨터)" />
    </SlideShell>
  );
}
