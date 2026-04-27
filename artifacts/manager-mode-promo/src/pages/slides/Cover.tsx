export default function Cover() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-body text-text">
      <div className="absolute inset-0 bg-gradient-to-br from-primary-soft via-bg to-bg" />

      <div className="absolute -top-[20vh] -right-[10vw] w-[55vw] h-[55vw] rounded-full bg-primary opacity-20 blur-[6vw]" />
      <div className="absolute top-[35vh] right-[8vw] w-[28vw] h-[28vw] rounded-full bg-primary-deep opacity-25 blur-[4vw]" />

      <div className="absolute top-[6vh] left-[6vw] flex items-center gap-[1vw]">
        <div className="w-[1.6vw] h-[1.6vw] rounded-md bg-primary" />
        <div className="text-[1.4vw] font-display font-bold tracking-tight text-ink">
          관리의달인
        </div>
      </div>

      <div className="absolute top-[6vh] right-[6vw] text-[1.1vw] font-body text-muted tracking-wide">
        외부 홍보 데크 v1.0
      </div>

      <div className="relative z-10 h-full flex flex-col justify-center pl-[8vw] pr-[40vw]">
        <div className="text-[1.4vw] font-display font-bold tracking-[0.3em] text-primary uppercase mb-[3vh]">
          Manager Mode
        </div>

        <h1 className="font-display font-black text-ink tracking-tighter text-[7.5vw] leading-[0.95]">
          관리소장 모드
        </h1>

        <div className="mt-[4vh] w-[18vw] h-[0.4vh] bg-primary rounded-full" />

        <p className="mt-[4vh] text-[2vw] font-display font-bold leading-[1.35] text-ink max-w-[42vw]">
          수기 업무를 데이터로 바꾸는<br className="hidden" />
          <span className="text-primary"> AI 관리 운영체계</span>
        </p>

        <p className="mt-[3vh] text-[1.4vw] font-body font-medium leading-[1.6] text-muted max-w-[40vw]">
          5대 핵심 서비스로 관리소장의 모든 업무를 한 화면에 모읍니다. 업무 누락
          제로, 투명한 비용 집행, 보고서 자동화까지 한 번에.
        </p>
      </div>

      <div className="absolute bottom-[5vh] left-[8vw] right-[8vw] flex items-end justify-between">
        <div className="text-[1.1vw] font-body text-muted">
          Building Operations · 위탁관리 · 입주자대표회의 영업 자료
        </div>
        <div className="text-[1.1vw] font-body font-medium text-ink tracking-wide">
          관리의달인 · Manager-Master
        </div>
      </div>
    </div>
  );
}
