import { SlideShell, PageHeader, BrowserShot, FootBar, CalloutPill } from "@/components/manual";
import shot from "@/assets/screens/c4/desktop/daily.png";

export default function C4Actions() {
  return (
    <SlideShell>
      <PageHeader chapter={4} label="일보를 다른 사람에게" page={16} />

      <h1 className="absolute top-[12vh] left-[5vw] right-[5vw] font-display font-black text-ink tracking-tight text-[3.4vw] leading-[1.1]">
        일보 위쪽의 버튼 3개 — 무엇이 어디로 가나요?
      </h1>

      <div className="absolute top-[22vh] left-[5vw] right-[5vw] flex items-start gap-[2vw]">
        <BrowserShot src={shot} alt="컴퓨터 일보 상단 버튼: 이미지로 저장 / 공유 / 인쇄" widthVw={50} heightVh={62} />

        <div className="flex-1 flex flex-col gap-[1.2vh]">
          <div className="bg-surface border border-line rounded-2xl px-[1.4vw] py-[1.6vh]">
            <CalloutPill text="이미지로 저장" tone="primary" />
            <div className="mt-[0.6vh] text-[1.4vw] font-display font-bold text-ink">PNG 파일 한 장</div>
            <div className="mt-[0.4vh] text-[1.1vw] text-text">사진처럼 한 장으로 저장됩니다. 카톡에 첨부할 때 가장 편합니다.</div>
          </div>
          <div className="bg-surface border border-line rounded-2xl px-[1.4vw] py-[1.6vh]">
            <CalloutPill text="공유" tone="accent" />
            <div className="mt-[0.6vh] text-[1.4vw] font-display font-bold text-ink">스마트폰 ‘공유 시트’</div>
            <div className="mt-[0.4vh] text-[1.1vw] text-text">카톡·문자·메일 중 원하는 앱 선택. 아이폰에서는 PDF 파일이 자동 저장됩니다.</div>
          </div>
          <div className="bg-surface border border-line rounded-2xl px-[1.4vw] py-[1.6vh]">
            <CalloutPill text="인쇄" tone="success" />
            <div className="mt-[0.6vh] text-[1.4vw] font-display font-bold text-ink">바로 프린터로</div>
            <div className="mt-[0.4vh] text-[1.1vw] text-text">PDF 미리보기를 거쳐 인쇄됩니다. A4 한 장에 깔끔하게 나옵니다.</div>
          </div>
        </div>
      </div>

      <FootBar leftHint="16 / 34 · 4챕터 · 보고서 액션" rightHint="이 3개 버튼은 모든 보고서(일보·주보·월보)에서 동일합니다" />
    </SlideShell>
  );
}
