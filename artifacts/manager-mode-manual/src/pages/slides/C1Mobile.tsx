import { SlideShell, PageHeader, PhoneShot, StepCard, FootBar, MenuPath } from "@/components/manual";
import shotHome from "@/assets/screens/home/mobile/dashboard.png";
import shotList from "@/assets/screens/c1/mobile/list.png";

export default function C1Mobile() {
  return (
    <SlideShell>
      <PageHeader chapter={1} label="스마트폰에서 따라하기" page={4} />

      <h1 className="absolute top-[12vh] left-[5vw] right-[5vw] font-display font-black text-ink tracking-tight text-[3.4vw] leading-[1.1]">
        필수업무 · 스마트폰에서 처리하기
      </h1>

      <div className="absolute top-[20vh] left-[5vw] right-[5vw] flex items-start gap-[2vw]">
        <PhoneShot src={shotHome} alt="모바일 홈 화면 — 필수업무 카드" />
        <PhoneShot src={shotList} alt="모바일 필수업무 목록 — 25건 중 기한초과 3건" />

        <div className="flex-1 flex flex-col gap-[1.2vh]">
          <MenuPath items={["홈", "필수업무 카드 '모두 보기'"]} />
          <StepCard n={1} title="홈 화면 ‘필수업무현황’ 카드" body="빨간 점은 기한이 지난 항목입니다. ‘모두 보기 ›’를 누릅니다." />
          <StepCard n={2} title="필수업무 목록이 열립니다" body="화면 위쪽 6개 통계칸: 전체 / 기한초과 / 30·60·180·365일 안에 처리할 일." />
          <StepCard n={3} title="‘기한 초과’ 줄이 가장 위에 있습니다" body="빨간 띠가 보이는 항목부터 누르세요. ‘5일 지남’ 같은 표시가 같이 붙습니다." />
          <StepCard n={4} title="처리 결과를 고릅니다" body="완료 / 연기 / 견적 요청 중 하나를 누르면 자동으로 보고서에 들어갑니다." highlight />
        </div>
      </div>

      <FootBar leftHint="04 / 34 · 1챕터 · 모바일" rightHint="실제 앱 화면 캡처" />
    </SlideShell>
  );
}
