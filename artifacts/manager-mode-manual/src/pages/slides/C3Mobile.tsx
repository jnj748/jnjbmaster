import { SlideShell, PageHeader, PhoneShot, StepCard, FootBar, MenuPath } from "@/components/manual";
import shotHome from "@/assets/screens/home/mobile/dashboard.png";
import shotTimeline from "@/assets/screens/c3/mobile/timeline.png";

export default function C3Mobile() {
  return (
    <SlideShell>
      <PageHeader chapter={3} label="스마트폰에서 업무기록" page={11} />

      <h1 className="absolute top-[12vh] left-[5vw] right-[5vw] font-display font-black text-ink tracking-tight text-[3.4vw] leading-[1.1]">
        업무기록 · 스마트폰에서 한 줄 적기
      </h1>

      <div className="absolute top-[20vh] left-[5vw] right-[5vw] flex items-start gap-[2vw]">
        <PhoneShot src={shotHome} alt="모바일 홈 — 오른쪽 아래 ‘+ 업무기록’ 버튼" />
        <PhoneShot src={shotTimeline} alt="모바일 업무일지 — 금일기록 탭" />

        <div className="flex-1 flex flex-col gap-[1.2vh]">
          <MenuPath items={["하단 네비", "가운데 ‘+ 업무기록’"]} />
          <StepCard n={1} title="화면 가운데 ‘+ 업무기록’ 버튼" body="홈, 일지, 어디서나 보입니다. 바로 누르면 입력창이 올라옵니다." />
          <StepCard n={2} title="유형 고르기 (한 번만 누르면 됩니다)" body="민원 / 시설 / 안전 / 외부미팅 / 기타. 잘 모르겠으면 ‘기타’도 됩니다." />
          <StepCard n={3} title="제목·내용 한 줄 + 사진" body="‘민원, 503호 누수 신고, 김반장 출동’처럼 짧게 적어도 충분합니다." />
          <StepCard n={4} title="‘저장’을 누르면 끝" body="오늘 일보의 ‘기록’ 부분에 자동으로 들어갑니다." highlight />
        </div>
      </div>

      <FootBar leftHint="11 / 34 · 3챕터 · 모바일" rightHint="실제 앱 화면 캡처" />
    </SlideShell>
  );
}
