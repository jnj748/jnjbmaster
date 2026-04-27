export default function PainPoints() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-body text-text px-[8vw] py-[7vh]">
      <div className="flex items-center gap-[1vw]">
        <div className="w-[1.2vw] h-[1.2vw] rounded-md bg-primary" />
        <div className="text-[1.1vw] font-display font-bold tracking-[0.25em] text-primary uppercase">
          Problem
        </div>
        <div className="ml-auto text-[1vw] font-body text-muted">02 · 문제 제기</div>
      </div>

      <h1 className="mt-[2.5vh] font-display font-black text-ink tracking-tight text-[4vw] leading-[1.1] max-w-[70vw]">
        지금 관리소장은 이런 일을<br className="hidden" />
        <span className="text-primary"> 손으로 </span>하고 있습니다
      </h1>

      <p className="mt-[2vh] text-[1.4vw] font-body text-muted leading-[1.55] max-w-[55vw]">
        업무는 늘어나는데 도구는 그대로입니다. 관리소장 한 명이 종이·엑셀·메신저
        사이를 오가며 처리해야 하는 일이 매일 쌓여갑니다.
      </p>

      <div className="mt-[5vh] grid grid-cols-2 gap-[2vw]">
        <div className="bg-surface border border-line p-[3vh_2.5vw] rounded-2xl">
          <div className="flex items-center gap-[1vw]">
            <div className="text-[1.6vw] font-display font-black text-primary tracking-tight">
              01
            </div>
            <div className="text-[1.6vw] font-display font-bold text-ink tracking-tight">
              종이·엑셀에 흩어진 점검 기록
            </div>
          </div>
          <p className="mt-[1.5vh] text-[1.5vw] font-body text-muted leading-[1.55]">
            점검표·검침치·민원 메모가 곳곳에 흩어져 있어 다음 사람이 찾을 수
            없습니다.
          </p>
        </div>

        <div className="bg-surface border border-line p-[3vh_2.5vw] rounded-2xl">
          <div className="flex items-center gap-[1vw]">
            <div className="text-[1.6vw] font-display font-black text-primary tracking-tight">
              02
            </div>
            <div className="text-[1.6vw] font-display font-bold text-ink tracking-tight">
              누락되기 쉬운 법정·정기 업무
            </div>
          </div>
          <p className="mt-[1.5vh] text-[1.5vw] font-body text-muted leading-[1.55]">
            소방·전기·승강기·자격증 만료가 한 사람의 머릿속 일정에 의존합니다.
          </p>
        </div>

        <div className="bg-surface border border-line p-[3vh_2.5vw] rounded-2xl">
          <div className="flex items-center gap-[1vw]">
            <div className="text-[1.6vw] font-display font-black text-primary tracking-tight">
              03
            </div>
            <div className="text-[1.6vw] font-display font-bold text-ink tracking-tight">
              매월 반복되는 보고서 작성
            </div>
          </div>
          <p className="mt-[1.5vh] text-[1.5vw] font-body text-muted leading-[1.55]">
            공고문·기안서·일간/주간/월간 일지를 매번 처음부터 새로 작성합니다.
          </p>
        </div>

        <div className="bg-surface border border-line p-[3vh_2.5vw] rounded-2xl">
          <div className="flex items-center gap-[1vw]">
            <div className="text-[1.6vw] font-display font-black text-primary tracking-tight">
              04
            </div>
            <div className="text-[1.6vw] font-display font-bold text-ink tracking-tight">
              비교 기준 없는 업체 견적
            </div>
          </div>
          <p className="mt-[1.5vh] text-[1.5vw] font-body text-muted leading-[1.55]">
            동일 항목 비교가 어려워 적정가 판단이 곧 관리소장 개인 책임이 됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
