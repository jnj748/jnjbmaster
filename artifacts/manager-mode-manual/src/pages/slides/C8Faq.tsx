import { SlideShell, PageHeader, FootBar } from "@/components/manual";

const FAQ = [
  {
    q: "‘공유’를 눌렀는데 아무 일도 일어나지 않아요.",
    a: "아이폰에서 자주 보입니다. 다운로드 폴더에 PDF가 저장된 상태입니다. 파일 앱에서 한 번만 더 눌러 주세요.",
  },
  {
    q: "보내려는 카톡 단톡방이 없습니다.",
    a: "‘공유’를 누른 다음 카톡 시트에서 ‘새 채팅’을 눌러 사람을 직접 고를 수 있습니다.",
  },
  {
    q: "이미지가 너무 작거나 커요.",
    a: "‘이미지로 저장’은 화면 그대로 한 장 PNG로 저장됩니다. 컴퓨터에서 받으면 더 크게 보입니다.",
  },
  {
    q: "공고문을 한글에서 수정하고 싶어요.",
    a: "‘공지문 템플릿’의 ‘문서 저장’ 버튼을 누르면 .docx 파일이 다운로드됩니다. 한글에서 바로 열 수 있습니다.",
  },
  {
    q: "인쇄가 자동으로 안 떠요.",
    a: "PDF 미리보기 창의 위쪽 인쇄 아이콘을 직접 한 번만 눌러 주세요. 결과는 같습니다.",
  },
  {
    q: "본부장께 다시 보내야 하는데 보고서가 어디 있나요?",
    a: "‘업무일지 → 일보/주보(자동)/월보(자동)’ 탭의 좌·우 화살표로 지난 자료를 다시 열 수 있습니다. 다시 ‘공유’만 누르세요.",
  },
];

export default function C8Faq() {
  return (
    <SlideShell>
      <PageHeader chapter={8} label="자주 듣는 질문" page={32} />

      <h1 className="absolute top-[12vh] left-[5vw] right-[5vw] font-display font-black text-ink tracking-tight text-[3.4vw] leading-[1.1]">
        공유·인쇄에서 막히실 때
      </h1>

      <div className="absolute top-[22vh] left-[5vw] right-[5vw] grid grid-cols-2 gap-x-[2vw] gap-y-[1.4vh]">
        {FAQ.map((it, i) => (
          <div key={i} className="bg-surface border border-line rounded-2xl px-[1.4vw] py-[1.4vh]">
            <div className="flex items-start gap-[0.8vw]">
              <div className="w-[2vw] h-[2vw] rounded-md bg-primary text-surface flex items-center justify-center text-[1.1vw] font-display font-black shrink-0">
                Q
              </div>
              <div className="text-[1.3vw] font-display font-bold text-ink leading-snug">{it.q}</div>
            </div>
            <div className="mt-[0.6vh] flex items-start gap-[0.8vw]">
              <div className="w-[2vw] h-[2vw] rounded-md bg-accent-soft text-ink flex items-center justify-center text-[1.1vw] font-display font-black shrink-0">
                A
              </div>
              <div className="text-[1.1vw] font-body text-text leading-snug">{it.a}</div>
            </div>
          </div>
        ))}
      </div>

      <FootBar leftHint="32 / 34 · 8챕터 · 자주 듣는 질문" />
    </SlideShell>
  );
}
