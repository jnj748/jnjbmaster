import { SlideShell, PageHeader, PhoneShot, BrowserShot, StepCard, FootBar } from "@/components/manual";
import shotMobile from "@/assets/screens/c5/mobile/weekly.png";
import shotDesktop from "@/assets/screens/c5/desktop/weekly.png";

export default function C5Devices() {
  return (
    <SlideShell>
      <PageHeader chapter={5} label="모바일·컴퓨터 같은 화면" page={18} />

      <h1 className="absolute top-[12vh] left-[5vw] right-[5vw] font-display font-black text-ink tracking-tight text-[3.4vw] leading-[1.1]">
        주보(자동) · 한 주를 한 장으로
      </h1>

      <div className="absolute top-[22vh] left-[5vw] right-[5vw] flex items-start gap-[1.5vw]">
        <PhoneShot src={shotMobile} alt="모바일 주보 — 주차 선택과 자동 요약" widthVw={18} heightVh={62} />
        <BrowserShot src={shotDesktop} alt="컴퓨터 주보 — ‘주보(자동)’ 탭의 주간 보고서" widthVw={42} heightVh={62} />

        <div className="flex-1 flex flex-col gap-[1vh]">
          <StepCard n={1} title="‘주보(자동)’ 탭 누르기" body="컴퓨터 사이드바 ‘업무일지’ → 가운데 셋째 탭. 모바일은 일지 화면 위쪽 셋째 칸." />
          <StepCard n={2} title="주차 선택은 좌우 화살표로" body="가운데 ‘이번 주’ 박스를 누르면 달력. 지난 주는 좌측 ‘‹’ 화살표." />
          <StepCard n={3} title="‘주간 코멘트’만 한 줄 더하기" body="아래쪽 ‘주간 한 줄 코멘트’ 칸에 본부에 알릴 한 마디만 추가합니다." />
          <StepCard n={4} title="저장하면 결재함으로 자동" body="별도로 보내실 필요 없이 본부장 결재함으로 갑니다." highlight />
        </div>
      </div>

      <FootBar leftHint="18 / 34 · 5챕터 · 모바일·컴퓨터" rightHint="실제 앱 화면 캡처" />
    </SlideShell>
  );
}
