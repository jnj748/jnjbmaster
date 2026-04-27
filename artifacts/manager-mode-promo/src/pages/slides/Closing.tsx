export default function Closing() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-ink font-body text-surface">
      <div className="absolute -top-[20vh] -right-[10vw] w-[55vw] h-[55vw] rounded-full bg-primary opacity-25 blur-[6vw]" />
      <div className="absolute -bottom-[25vh] -left-[10vw] w-[45vw] h-[45vw] rounded-full bg-primary-deep opacity-30 blur-[6vw]" />

      <div className="absolute top-[6vh] left-[6vw] flex items-center gap-[1vw]">
        <div className="w-[1.6vw] h-[1.6vw] rounded-md bg-primary" />
        <div className="text-[1.4vw] font-display font-bold tracking-tight">
          관리의달인
        </div>
      </div>
      <div className="absolute top-[6vh] right-[6vw] text-[1vw] font-body opacity-60">
        10 · Closing
      </div>

      <div className="relative z-10 h-full flex flex-col justify-center pl-[8vw] pr-[8vw]">
        <div className="text-[1.4vw] font-display font-bold tracking-[0.3em] text-primary uppercase mb-[3vh]">
          Manager Mode
        </div>

        <h1 className="font-display font-black tracking-tighter text-[6vw] leading-[1.0] max-w-[80vw]">
          관리소장 업무를,<br className="hidden" />
          <span className="text-primary"> 데이터로 다시 정의합니다.</span>
        </h1>

        <p className="mt-[4vh] text-[1.6vw] font-display font-medium opacity-80 max-w-[55vw] leading-[1.5]">
          단지 규모와 운영 환경에 맞춘 도입 컨설팅을 무상으로 제공합니다.
          관리소장 모드 도입 문의는 언제든 환영합니다.
        </p>

        <div className="mt-[6vh] grid grid-cols-3 gap-[2vw] max-w-[64vw]">
          <div>
            <div className="text-[1vw] font-body opacity-60 tracking-wide">
              도입 문의
            </div>
            <div className="mt-[0.8vh] text-[1.6vw] font-display font-bold tracking-tight">
              contact@manager-master.kr
            </div>
          </div>
          <div>
            <div className="text-[1vw] font-body opacity-60 tracking-wide">
              상담 전화
            </div>
            <div className="mt-[0.8vh] text-[1.6vw] font-display font-bold tracking-tight">
              1599-0000
            </div>
          </div>
          <div>
            <div className="text-[1vw] font-body opacity-60 tracking-wide">
              자료실
            </div>
            <div className="mt-[0.8vh] text-[1.6vw] font-display font-bold tracking-tight">
              manager-master.kr
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-[5vh] left-[8vw] right-[8vw] flex items-end justify-between">
        <div className="text-[1vw] font-body opacity-55">
          © 2026 관리의달인 · Manager-Master. All rights reserved.
        </div>
        <div className="text-[1.1vw] font-body font-medium tracking-wide">
          관리의달인 · Manager-Master
        </div>
      </div>
    </div>
  );
}
