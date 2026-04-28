import { SlideShell, FootBar } from "@/components/manual";

const ROWS = [
  { n: 1, title: "필수업무", path: "사이드바 · 든든하게 지키는 시설관리 · 필수업무", do: "기한 초과(빨강)부터 처리" },
  { n: 2, title: "제안업무", path: "사이드바 · 든든하게 지키는 시설관리 · 제안업무", do: "노랑·초록 D-7 권장 시점 확인" },
  { n: 3, title: "업무기록", path: "하단 ‘+ 업무기록’ / 컴퓨터 ‘업무일지 → 금일기록’", do: "한 줄 + 사진으로 저장" },
  { n: 4, title: "일지(일보)", path: "사이드바 · 보고·전자결재 · 업무일지 · 일보", do: "한 줄 코멘트 후 ‘일지 작성’" },
  { n: 5, title: "주보(자동)", path: "업무일지 · 주보(자동) 탭", do: "주간 코멘트 한 줄만 추가" },
  { n: 6, title: "월보(자동)", path: "업무일지 · 월보(자동) 탭", do: "월간 코멘트 한 줄, 결재 자동" },
  { n: 7, title: "공고문 템플릿", path: "사이드바 · 시설관리 · 공지문 템플릿", do: "카드 선택 → 빈 칸만 채우기" },
  { n: 8, title: "공유·인쇄", path: "보고서/공고문 위쪽 줄의 버튼", do: "이미지·공유·인쇄 (공고문은 +문서 저장)" },
];

export default function Summary() {
  return (
    <SlideShell>
      <div className="absolute top-[5vh] left-[5vw] flex items-center gap-[1vw]">
        <div className="w-[1.4vw] h-[1.4vw] rounded-md bg-primary" />
        <div className="text-[1.3vw] font-display font-bold tracking-[0.25em] text-primary uppercase">
          Summary
        </div>
      </div>
      <div className="absolute top-[5vh] right-[5vw] text-[1.2vw] font-body text-muted">33 / 34</div>

      <h1 className="absolute top-[12vh] left-[5vw] right-[5vw] font-display font-black text-ink tracking-tighter text-[4.5vw] leading-[1]">
        한 장으로 보는 8가지 흐름
      </h1>

      <div className="absolute top-[24vh] left-[5vw] right-[5vw]">
        <div className="grid grid-cols-[3vw_10vw_36vw_36vw] gap-x-[1vw] text-[1.1vw] font-display font-bold text-muted uppercase tracking-wider px-[1vw] pb-[0.8vh]">
          <div>#</div><div>챕터</div><div>들어가는 길</div><div>해야 할 행동</div>
        </div>
        <div className="rounded-2xl bg-surface border border-line overflow-hidden">
          {ROWS.map((r, i) => (
            <div
              key={r.n}
              className={"grid grid-cols-[3vw_10vw_36vw_36vw] gap-x-[1vw] items-center px-[1vw] py-[1.3vh] " + (i % 2 ? "bg-bg" : "")}
            >
              <div className="text-[1.4vw] font-display font-black text-primary">{r.n}</div>
              <div className="text-[1.4vw] font-display font-bold text-ink">{r.title}</div>
              <div className="text-[1.05vw] font-body text-text leading-snug">{r.path}</div>
              <div className="text-[1.05vw] font-body text-text leading-snug">{r.do}</div>
            </div>
          ))}
        </div>
      </div>

      <FootBar leftHint="33 / 34 · 한눈 요약" rightHint="복사해 두실 줄: 메뉴 이름은 항상 같습니다." />
    </SlideShell>
  );
}
