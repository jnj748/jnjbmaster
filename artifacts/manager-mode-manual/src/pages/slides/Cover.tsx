export default function Cover() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-body text-text">
      <div className="absolute inset-0 bg-gradient-to-br from-primary-soft via-bg to-bg" />
      <div className="absolute -top-[20vh] -right-[10vw] w-[55vw] h-[55vw] rounded-full bg-primary opacity-20 blur-[6vw]" />
      <div className="absolute top-[30vh] right-[6vw] w-[28vw] h-[28vw] rounded-full bg-primary-deep opacity-20 blur-[4vw]" />

      <div className="absolute top-[6vh] left-[6vw] flex items-center gap-[1vw]">
        <div className="w-[1.8vw] h-[1.8vw] rounded-md bg-primary" />
        <div className="text-[1.6vw] font-display font-bold tracking-tight text-ink">
          관리의달인
        </div>
      </div>

      <div className="absolute top-[6vh] right-[6vw] text-[1.3vw] font-body text-muted tracking-wide">
        사용 매뉴얼 v1.0 · 2026
      </div>

      <div className="relative z-10 h-full flex flex-col justify-center pl-[8vw] pr-[40vw]">
        <div className="text-[1.6vw] font-display font-bold tracking-[0.3em] text-primary uppercase mb-[3vh]">
          Manager Mode · User Guide
        </div>

        <h1 className="font-display font-black text-ink tracking-tighter text-[7vw] leading-[0.95]">
          관리소장 모드
        </h1>
        <h2 className="mt-[1vh] font-display font-black text-primary tracking-tighter text-[5vw] leading-[1]">
          사용 매뉴얼
        </h2>

        <div className="mt-[4vh] w-[20vw] h-[0.5vh] bg-primary rounded-full" />

        <p className="mt-[4vh] text-[2.2vw] font-display font-bold leading-[1.35] text-ink max-w-[44vw]">
          어렵지 않습니다. 한 단계씩 따라만 하면 끝납니다.
        </p>

        <p className="mt-[3vh] text-[1.7vw] font-body font-medium leading-[1.6] text-text max-w-[44vw]">
          스마트폰과 컴퓨터에서 보이는 화면을 모두 보여드립니다. 글씨가 큰 화면 그대로
          따라하시면 됩니다.
        </p>
      </div>

      <div className="absolute bottom-[5vh] left-[8vw] right-[8vw] flex items-end justify-between">
        <div className="text-[1.3vw] font-body text-muted">
          관리소장(시니어)님께 · 인쇄해서 옆에 두고 보셔도 좋습니다
        </div>
        <div className="text-[1.3vw] font-body font-medium text-ink tracking-wide">
          관리의달인 · Manager-Master
        </div>
      </div>
    </div>
  );
}
