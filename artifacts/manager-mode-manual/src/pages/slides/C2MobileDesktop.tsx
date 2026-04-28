import { SlideShell, PageHeader, PhoneShot, BrowserShot, StepCard, FootBar } from "@/components/manual";
import shotMobile from "@/assets/screens/c2/mobile/list.png";
import shotDesktop from "@/assets/screens/c2/desktop/list.png";

export default function C2MobileDesktop() {
  return (
    <SlideShell>
      <PageHeader chapter={2} label="모바일·컴퓨터 같은 화면" page={8} />

      <h1 className="absolute top-[12vh] left-[5vw] right-[5vw] font-display font-black text-ink tracking-tight text-[3.4vw] leading-[1.1]">
        제안업무 · 모바일과 컴퓨터에서 처리하기
      </h1>

      <div className="absolute top-[22vh] left-[5vw] right-[5vw] flex items-start gap-[2vw]">
        <PhoneShot src={shotMobile} alt="모바일 제안업무 목록" widthVw={20} />
        <BrowserShot src={shotDesktop} alt="컴퓨터 제안업무 목록 — 사이드바 ‘든든하게 지키는 시설관리 › 제안업무’ 강조" widthVw={48} />

        <div className="flex-1 flex flex-col gap-[1vh]">
          <StepCard n={1} title="‘제안업무’ 메뉴 들어가기" body="모바일은 홈 카드 ‘모두 보기 ›’, 컴퓨터는 왼쪽 사이드바 ‘제안업무’." />
          <StepCard n={2} title="줄 끝의 ‘D-7’이 권장 시점" body="며칠 안에 처리하면 좋다는 안내입니다. 빨간 띠가 아니라 노랑·초록색." />
          <StepCard n={3} title="줄을 누르면 ‘처리 / 연기 / 제외’" body="처리하면 일보로, 제외하면 우리 건물 목록에서 빠집니다." highlight />
        </div>
      </div>

      <FootBar leftHint="08 / 34 · 2챕터 · 모바일·컴퓨터" rightHint="실제 앱 화면 캡처" />
    </SlideShell>
  );
}
