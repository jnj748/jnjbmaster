import { SlideShell } from "@/components/manual";

const ITEMS = [
  { n: 1, title: "필수업무 처리", sub: "법정 의무 업무를 늦지 않게 해결하기", page: 3 },
  { n: 2, title: "제안업무 처리", sub: "지금 시기에 권장되는 업무를 한 번에", page: 7 },
  { n: 3, title: "업무기록 작성", sub: "오늘 한 일을 한 줄로 남기기", page: 10 },
  { n: 4, title: "일지(일보) 만들기", sub: "오늘 자료를 자동으로 모아 일보 발행", page: 13 },
  { n: 5, title: "주보(자동)", sub: "한 주 일보가 자동으로 주보로 합쳐짐", page: 17 },
  { n: 6, title: "월보(자동)", sub: "한 달 주보가 자동으로 월보로 합쳐짐", page: 20 },
  { n: 7, title: "공고문 템플릿", sub: "건물 정보가 자동 채워지는 공고문 만들기", page: 23 },
  { n: 8, title: "공유·인쇄", sub: "이미지 저장 / 카톡 공유 / 인쇄 / 문서 저장", page: 27 },
];

export default function Toc() {
  return (
    <SlideShell>
      <div className="absolute top-[5vh] left-[5vw] flex items-center gap-[1vw]">
        <div className="w-[1.4vw] h-[1.4vw] rounded-md bg-primary" />
        <div className="text-[1.3vw] font-display font-bold tracking-[0.25em] text-primary uppercase">
          Contents
        </div>
      </div>
      <div className="absolute top-[5vh] right-[5vw] text-[1.2vw] font-body text-muted">
        02 / 34
      </div>

      <div className="absolute top-[12vh] left-[5vw]">
        <h1 className="font-display font-black text-ink tracking-tighter text-[5.2vw] leading-[1]">
          이 매뉴얼의 8가지 길
        </h1>
        <p className="mt-[1.2vh] text-[1.6vw] font-body font-medium text-muted">
          궁금한 챕터부터 보셔도 됩니다. 모든 화면은 실제 앱 그대로입니다.
        </p>
      </div>

      <div className="absolute top-[30vh] left-[5vw] right-[5vw] grid grid-cols-2 gap-x-[2.5vw] gap-y-[1.4vh]">
        {ITEMS.map((it) => (
          <div key={it.n} className="flex items-center gap-[1.2vw] bg-surface border border-line rounded-2xl px-[1.4vw] py-[1.5vh]">
            <div className="w-[3vw] h-[3vw] rounded-xl bg-primary text-surface flex items-center justify-center text-[1.6vw] font-display font-black">
              {it.n}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[1.7vw] font-display font-bold text-ink truncate">{it.title}</div>
              <div className="text-[1.15vw] font-body text-muted truncate">{it.sub}</div>
            </div>
            <div className="text-[1.3vw] font-display font-bold text-primary whitespace-nowrap">{it.page}쪽</div>
          </div>
        ))}
      </div>

      <div className="absolute bottom-[3vh] left-[5vw] right-[5vw] flex items-center justify-between text-[1vw] font-body text-muted">
        <span>매뉴얼의 모든 화면은 관리소장 계정으로 직접 캡처한 것입니다.</span>
        <span>관리의달인 · 관리소장 모드 매뉴얼</span>
      </div>
    </SlideShell>
  );
}
