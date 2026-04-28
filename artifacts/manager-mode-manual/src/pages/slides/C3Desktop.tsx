import { SlideShell, PageHeader, BrowserShot, StepCard, FootBar, MenuPath } from "@/components/manual";
import shot from "@/assets/screens/c3/desktop/timeline.png";

export default function C3Desktop() {
  return (
    <SlideShell>
      <PageHeader chapter={3} label="컴퓨터에서 업무기록" page={12} />

      <h1 className="absolute top-[12vh] left-[5vw] right-[5vw] font-display font-black text-ink tracking-tight text-[3.4vw] leading-[1.1]">
        업무기록 · 컴퓨터의 ‘업무일지 › 금일기록’ 탭
      </h1>

      <div className="absolute top-[20vh] left-[5vw] right-[5vw] flex items-start gap-[2vw]">
        <BrowserShot src={shot} alt="컴퓨터 업무일지 — 금일기록 탭" widthVw={56} />

        <div className="flex-1 flex flex-col gap-[1.2vh]">
          <MenuPath items={["사이드바", "차곡차곡 쌓는 보고·전자결재", "업무일지", "금일기록"]} />
          <StepCard n={1} title="‘업무일지’ 메뉴 → ‘금일기록’ 탭" body="사이드바에서 ‘업무일지’를 누르면 다섯 개 탭이 나옵니다. 첫 탭이 ‘금일기록’." />
          <StepCard n={2} title="오늘 들어온 모든 기록이 시간 순" body="필수·제안업무 결과, 새로 적은 업무기록이 한 줄씩 시간 순으로 나옵니다." />
          <StepCard n={3} title="오른쪽 아래 ‘+ 업무기록’ 버튼" body="컴퓨터에서도 같은 버튼이 항상 보입니다. 한 번 눌러 새 기록을 추가하세요." />
          <StepCard n={4} title="기록을 누르면 수정·삭제" body="오타·사진 수정은 그 자리에서 가능합니다. 기록은 작성자만 고칠 수 있습니다." highlight />
        </div>
      </div>

      <FootBar leftHint="12 / 34 · 3챕터 · 컴퓨터" rightHint="실제 앱 화면 캡처" />
    </SlideShell>
  );
}
