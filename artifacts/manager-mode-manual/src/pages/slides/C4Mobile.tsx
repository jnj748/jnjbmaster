import { SlideShell, PageHeader, PhoneShot, StepCard, FootBar, MenuPath } from "@/components/manual";
import shot from "@/assets/screens/c4/mobile/daily.png";

export default function C4Mobile() {
  return (
    <SlideShell>
      <PageHeader chapter={4} label="스마트폰에서 일보" page={14} />

      <h1 className="absolute top-[12vh] left-[5vw] right-[5vw] font-display font-black text-ink tracking-tight text-[3.4vw] leading-[1.1]">
        일보 · 스마트폰에서 마감하기
      </h1>

      <div className="absolute top-[20vh] left-[5vw] right-[5vw] flex items-start gap-[2vw]">
        <PhoneShot src={shot} alt="모바일 일보 화면 — 자동 채워진 일일 업무보고서" widthVw={22} heightVh={70} />

        <div className="flex-1 flex flex-col gap-[1.2vh]">
          <MenuPath items={["하단 네비", "일지", "일보 탭"]} />
          <StepCard n={1} title="하단 ‘일지’ → ‘일보’ 탭" body="가운데 ‘일보’를 누르면 오늘 일자(예: 2026-04-28)가 보입니다." />
          <StepCard n={2} title="‘일일 업무보고서’가 이미 채워져 있음" body="건물명·작성자·작성일·총괄(완료/미완료/기안)이 자동으로 들어가 있습니다." />
          <StepCard n={3} title="‘1. 일일 일지’ 칸에 한 줄만 추가" body="오늘 본부에 알릴 메모를 한 줄 적어 주세요. ‘아직 작성되지 않았습니다’가 안내문입니다." />
          <StepCard n={4} title="오른쪽 위 ‘일지 작성’" body="누르면 그날 일보가 잠기고, 다음 단계는 ‘공유·인쇄’입니다 (8챕터)." highlight />
        </div>
      </div>

      <FootBar leftHint="14 / 34 · 4챕터 · 모바일" rightHint="실제 앱 화면 캡처" />
    </SlideShell>
  );
}
