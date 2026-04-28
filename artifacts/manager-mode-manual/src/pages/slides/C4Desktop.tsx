import { SlideShell, PageHeader, BrowserShot, StepCard, FootBar, MenuPath } from "@/components/manual";
import shot from "@/assets/screens/c4/desktop/daily.png";

export default function C4Desktop() {
  return (
    <SlideShell>
      <PageHeader chapter={4} label="컴퓨터에서 일보" page={15} />

      <h1 className="absolute top-[12vh] left-[5vw] right-[5vw] font-display font-black text-ink tracking-tight text-[3.4vw] leading-[1.1]">
        일보 · 컴퓨터에서 한눈에 확인
      </h1>

      <div className="absolute top-[20vh] left-[5vw] right-[5vw] flex items-start gap-[2vw]">
        <BrowserShot src={shot} alt="컴퓨터 일보 — 일일 업무보고서, 위에 ‘이미지로 저장 / 공유 / 인쇄’ 버튼 3개" widthVw={56} />

        <div className="flex-1 flex flex-col gap-[1.2vh]">
          <MenuPath items={["사이드바", "업무일지", "일보"]} />
          <StepCard n={1} title="‘일보’ 탭이 가운데" body="좌우 화살표로 어제·내일 일자도 볼 수 있습니다. 가운데 날짜 박스를 누르면 달력." />
          <StepCard n={2} title="제목 ‘일일 업무보고서’ 아래의 표" body="건물명·일자·작성자·총괄이 표 한 줄로 정리됩니다. 이대로 본부에 보내면 끝." />
          <StepCard n={3} title="아래 항목은 자동 정리" body="①일일 일지 ②금일 업무 기록 ③완료/미완료/기안 요약 ④법정 점검까지 순서대로 들어갑니다." />
          <StepCard n={4} title="오른쪽 위 ‘일지 작성’ → 마감" body="마감 후엔 ‘이미지로 저장 / 공유 / 인쇄’ 버튼이 살아납니다." highlight />
        </div>
      </div>

      <FootBar leftHint="15 / 34 · 4챕터 · 컴퓨터" rightHint="실제 앱 화면 캡처" />
    </SlideShell>
  );
}
