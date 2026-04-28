import { SlideShell, PageHeader, BrowserShot, StepCard, FootBar, MenuPath } from "@/components/manual";
import shot from "@/assets/screens/c1/desktop/list.png";

export default function C1Desktop() {
  return (
    <SlideShell>
      <PageHeader chapter={1} label="컴퓨터에서 따라하기" page={5} />

      <h1 className="absolute top-[12vh] left-[5vw] right-[5vw] font-display font-black text-ink tracking-tight text-[3.4vw] leading-[1.1]">
        필수업무 · 컴퓨터에서 처리하기
      </h1>

      <div className="absolute top-[20vh] left-[5vw] right-[5vw] flex items-start gap-[2vw]">
        <BrowserShot src={shot} alt="컴퓨터 필수업무 목록 — 사이드바 ‘든든하게 지키는 시설관리 › 필수업무’ 강조" widthVw={56} />

        <div className="flex-1 flex flex-col gap-[1.2vh]">
          <MenuPath items={["왼쪽 사이드바", "든든하게 지키는 시설관리", "필수업무"]} />
          <StepCard n={1} title="왼쪽 메뉴에서 ‘필수업무’ 클릭" body="‘든든하게 지키는 시설관리’ 그룹 안 두 번째 줄입니다." />
          <StepCard n={2} title="가장 위에 ‘기한 초과’ 묶음" body="빨간 띠가 붙은 항목입니다. 아래로 내리면 ‘예정’ 19건이 이어집니다." />
          <StepCard n={3} title="검색·기간 필터로 좁히기" body="제목에서 단어를 찾거나 ‘1년 이내 / 전체 유형’으로 추리세요." />
          <StepCard n={4} title="줄을 누르면 처리 화면" body="완료·연기·견적요청 중 하나를 고르고 사진·메모를 더할 수 있습니다." highlight />
        </div>
      </div>

      <FootBar leftHint="05 / 34 · 1챕터 · 컴퓨터" rightHint="실제 앱 화면 캡처" />
    </SlideShell>
  );
}
