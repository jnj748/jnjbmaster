import { SlideShell, CoverHeader, MenuPath, CalloutPill } from "@/components/manual";

export default function C3Cover() {
  return (
    <SlideShell>
      <CoverHeader chapter={3} page={10} />

      <div className="absolute top-[16vh] left-[5vw] right-[5vw]">
        <div className="text-[1.5vw] font-display font-bold tracking-[0.2em] text-primary uppercase">
          3. 업무기록 작성
        </div>
        <h1 className="mt-[1vh] font-display font-black text-ink tracking-tight text-[5vw] leading-[1.05]">
          오늘 한 일을<br />한 줄로 적어 두세요.
        </h1>
        <p className="mt-[2vh] text-[1.7vw] font-body font-medium text-muted max-w-[80vw]">
          필수·제안업무가 아닌 <span className="text-ink font-bold">평소 업무</span>는 ‘업무기록’으로 남깁니다.
          짧게 한 줄만 써도 일보가 자동으로 만들어 줍니다.
        </p>
      </div>

      <div className="absolute top-[55vh] left-[5vw] right-[5vw] flex flex-wrap items-center gap-[1.2vw]">
        <MenuPath items={["모바일 하단", "+ 업무기록"]} />
        <MenuPath items={["컴퓨터 사이드바", "차곡차곡 쌓는 보고·전자결재", "업무일지", "금일기록"]} />
        <CalloutPill text="홈 화면 오른쪽 아래 ‘+ 업무기록’ 버튼" tone="accent" />
      </div>

      <div className="absolute bottom-[8vh] left-[5vw] right-[5vw] grid grid-cols-3 gap-[1.5vw]">
        <div className="bg-surface border border-line rounded-2xl px-[1.4vw] py-[1.6vh]">
          <div className="text-[1.1vw] font-display font-bold tracking-[0.18em] text-primary uppercase">언제 쓰나요</div>
          <div className="mt-[0.6vh] text-[1.5vw] font-display font-bold text-ink">생긴 일·다닌 일</div>
          <div className="mt-[0.4vh] text-[1.1vw] text-muted">민원 응대·CCTV 확인·외부 미팅 등.</div>
        </div>
        <div className="bg-surface border border-line rounded-2xl px-[1.4vw] py-[1.6vh]">
          <div className="text-[1.1vw] font-display font-bold tracking-[0.18em] text-primary uppercase">얼마나 적나요</div>
          <div className="mt-[0.6vh] text-[1.5vw] font-display font-bold text-ink">한 줄이면 충분</div>
          <div className="mt-[0.4vh] text-[1.1vw] text-muted">사진을 같이 올려도 됩니다.</div>
        </div>
        <div className="bg-surface border border-line rounded-2xl px-[1.4vw] py-[1.6vh]">
          <div className="text-[1.1vw] font-display font-bold tracking-[0.18em] text-primary uppercase">어디로 가나요</div>
          <div className="mt-[0.6vh] text-[1.5vw] font-display font-bold text-ink">오늘 일보 ‘기록’</div>
          <div className="mt-[0.4vh] text-[1.1vw] text-muted">‘금일기록’ 탭에 모입니다.</div>
        </div>
      </div>

      <div className="absolute bottom-[3vh] left-[5vw] text-[1vw] font-body text-muted">10 / 34 · 3챕터 표지</div>
      <div className="absolute bottom-[3vh] right-[5vw] text-[1vw] font-body text-muted">관리의달인 · 관리소장 모드 매뉴얼</div>
    </SlideShell>
  );
}
