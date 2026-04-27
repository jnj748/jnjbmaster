export default function SolutionOverview() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-ink font-body text-surface px-[7vw] py-[7vh]">
      <div className="absolute -top-[20vh] -left-[10vw] w-[40vw] h-[40vw] rounded-full bg-primary opacity-25 blur-[6vw]" />
      <div className="absolute -bottom-[20vh] -right-[10vw] w-[40vw] h-[40vw] rounded-full bg-primary-deep opacity-30 blur-[6vw]" />

      <div className="relative z-10 flex items-center gap-[1vw]">
        <div className="w-[1.2vw] h-[1.2vw] rounded-md bg-primary" />
        <div className="text-[1.1vw] font-display font-bold tracking-[0.25em] text-primary uppercase">
          Solution
        </div>
        <div className="ml-auto text-[1vw] font-body opacity-60">
          03 · 5대 서비스 한눈에
        </div>
      </div>

      <h1 className="relative z-10 mt-[2.5vh] font-display font-black tracking-tight text-[4vw] leading-[1.1] max-w-[70vw]">
        관리소장 업무를 한 화면에 모으는<br className="hidden" />
        <span className="text-primary"> 5대 서비스</span>
      </h1>

      <p className="relative z-10 mt-[2vh] text-[1.4vw] font-body opacity-75 leading-[1.55] max-w-[55vw]">
        AI가 데이터를 정리하고, 시스템이 일정을 관리하고, 사진 한 장이 보고서가
        됩니다. 관리소장은 판단과 소통에만 집중합니다.
      </p>

      <div className="relative z-10 mt-[6vh] grid grid-cols-5 gap-[1.5vw]">
        <div className="bg-surface/8 border border-surface/15 backdrop-blur-sm p-[2.5vh_1.2vw] rounded-2xl">
          <div className="text-[1.2vw] font-display font-black text-primary tracking-[0.2em]">
            01
          </div>
          <div className="mt-[2vh] text-[1.7vw] font-display font-bold leading-[1.25] tracking-tight">
            건물정보<br className="hidden" /> AI 분석
          </div>
          <p className="mt-[1.5vh] text-[1.1vw] opacity-70 leading-[1.5]">
            도면·설비·이력을 통합 분석
          </p>
        </div>

        <div className="bg-surface/8 border border-surface/15 backdrop-blur-sm p-[2.5vh_1.2vw] rounded-2xl">
          <div className="text-[1.2vw] font-display font-black text-primary tracking-[0.2em]">
            02
          </div>
          <div className="mt-[2vh] text-[1.7vw] font-display font-bold leading-[1.25] tracking-tight">
            법정·추천<br className="hidden" /> 업무 자동알림
          </div>
          <p className="mt-[1.5vh] text-[1.1vw] opacity-70 leading-[1.5]">
            누락 없는 일정 관리
          </p>
        </div>

        <div className="bg-surface/8 border border-surface/15 backdrop-blur-sm p-[2.5vh_1.2vw] rounded-2xl">
          <div className="text-[1.2vw] font-display font-black text-primary tracking-[0.2em]">
            03
          </div>
          <div className="mt-[2vh] text-[1.7vw] font-display font-bold leading-[1.25] tracking-tight">
            사진 한 장으로<br className="hidden" /> 업무 완료
          </div>
          <p className="mt-[1.5vh] text-[1.1vw] opacity-70 leading-[1.5]">
            촬영만 하면 기록·보고 끝
          </p>
        </div>

        <div className="bg-surface/8 border border-surface/15 backdrop-blur-sm p-[2.5vh_1.2vw] rounded-2xl">
          <div className="text-[1.2vw] font-display font-black text-primary tracking-[0.2em]">
            04
          </div>
          <div className="mt-[2vh] text-[1.7vw] font-display font-bold leading-[1.25] tracking-tight">
            보고서·공고문<br className="hidden" /> 자동작성
          </div>
          <p className="mt-[1.5vh] text-[1.1vw] opacity-70 leading-[1.5]">
            일간·주간·월간 일지 자동
          </p>
        </div>

        <div className="bg-surface/8 border border-surface/15 backdrop-blur-sm p-[2.5vh_1.2vw] rounded-2xl">
          <div className="text-[1.2vw] font-display font-black text-primary tracking-[0.2em]">
            05
          </div>
          <div className="mt-[2vh] text-[1.7vw] font-display font-bold leading-[1.25] tracking-tight">
            파트너사<br className="hidden" /> 비교견적
          </div>
          <p className="mt-[1.5vh] text-[1.1vw] opacity-70 leading-[1.5]">
            동일 기준 다중 견적 비교
          </p>
        </div>
      </div>
    </div>
  );
}
