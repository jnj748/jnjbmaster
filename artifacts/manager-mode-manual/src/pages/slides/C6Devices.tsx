import { SlideShell, PageHeader, PhoneShot, BrowserShot, StepCard, FootBar } from "@/components/manual";
import shotMobile from "@/assets/screens/c6/mobile/monthly.png";
import shotDesktop from "@/assets/screens/c6/desktop/monthly.png";

export default function C6Devices() {
  return (
    <SlideShell>
      <PageHeader chapter={6} label="모바일·컴퓨터 같은 화면" page={21} />

      <h1 className="absolute top-[12vh] left-[5vw] right-[5vw] font-display font-black text-ink tracking-tight text-[3.4vw] leading-[1.1]">
        월보(자동) · 한 달을 한 장으로
      </h1>

      <div className="absolute top-[22vh] left-[5vw] right-[5vw] flex items-start gap-[1.5vw]">
        <PhoneShot src={shotMobile} alt="모바일 월보 — 월간 요약과 그래프" widthVw={18} heightVh={62} />
        <BrowserShot src={shotDesktop} alt="컴퓨터 월보 — ‘월보(자동)’ 탭의 월간 보고서" widthVw={42} heightVh={62} />

        <div className="flex-1 flex flex-col gap-[1vh]">
          <StepCard n={1} title="‘월보(자동)’ 탭 누르기" body="컴퓨터 사이드바 ‘업무일지’ → 넷째 탭. 모바일은 일지 화면 위쪽 넷째 칸." />
          <StepCard n={2} title="가운데 박스 = 이번 달" body="좌·우 화살표로 지난 달·다음 달 이동. 박스를 누르면 월 선택." />
          <StepCard n={3} title="확인할 4가지" body="① 완료율 ② 민원 처리 ③ 재무 한 줄 ④ 다음 달 권장 업무 5건." />
          <StepCard n={4} title="‘월간 코멘트’ 한 줄만" body="저장 시 본부장·사장 결재함으로 자동 분배됩니다." highlight />
        </div>
      </div>

      <FootBar leftHint="21 / 34 · 6챕터 · 모바일·컴퓨터" rightHint="실제 앱 화면 캡처" />
    </SlideShell>
  );
}
