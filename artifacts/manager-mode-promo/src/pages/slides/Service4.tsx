export default function Service4() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-body text-text">
      <div className="absolute top-[6vh] left-[6vw] flex items-center gap-[1vw]">
        <div className="w-[1.2vw] h-[1.2vw] rounded-md bg-primary" />
        <div className="text-[1.1vw] font-display font-bold tracking-[0.25em] text-primary uppercase">
          Service 04
        </div>
      </div>
      <div className="absolute top-[6vh] right-[6vw] text-[1vw] font-body text-muted">
        07 · 5대 서비스 ④
      </div>

      <div className="grid grid-cols-2 h-full">
        <div className="flex flex-col justify-center pl-[7vw] pr-[3vw]">
          <div className="font-display font-black text-primary tracking-tighter text-[10vw] leading-[0.85]">
            04
          </div>

          <h1 className="mt-[3vh] font-display font-black text-ink tracking-tight text-[3.4vw] leading-[1.1]">
            공고문·보고서·기안서·일지<br className="hidden" />
            <span className="text-primary"> 자동작성</span>
          </h1>

          <p className="mt-[2.5vh] text-[1.6vw] font-display font-medium text-text leading-[1.4] max-w-[36vw]">
            반복 문서 작성 시간을 시스템에 맡기고, 관리소장은 검토와 결재에만
            집중합니다.
          </p>

          <div className="mt-[4vh] flex flex-col gap-[1.8vh] max-w-[36vw]">
            <div className="flex gap-[1.2vw] items-start">
              <div className="mt-[0.6vh] w-[0.7vw] h-[0.7vw] rounded-full bg-primary shrink-0" />
              <div className="text-[1.5vw] font-body font-medium text-text leading-[1.5]">
                입주민 공고문·관리비 안내 문구를 즉시 생성
              </div>
            </div>
            <div className="flex gap-[1.2vw] items-start">
              <div className="mt-[0.6vh] w-[0.7vw] h-[0.7vw] rounded-full bg-primary shrink-0" />
              <div className="text-[1.5vw] font-body font-medium text-text leading-[1.5]">
                일간·주간·월간 업무일지를 데이터로 자동 정리
              </div>
            </div>
            <div className="flex gap-[1.2vw] items-start">
              <div className="mt-[0.6vh] w-[0.7vw] h-[0.7vw] rounded-full bg-primary shrink-0" />
              <div className="text-[1.5vw] font-body font-medium text-text leading-[1.5]">
                이사회 기안서 초안과 첨부자료를 한 묶음으로
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex items-center justify-center bg-primary-soft">
          <div className="absolute inset-0 bg-gradient-to-bl from-primary-soft via-bg to-primary-soft opacity-80" />

          <div className="relative w-[32vw] h-[50vh]">
            <div className="absolute top-[2vh] left-[1vw] right-[5vw] bottom-[6vh] bg-surface border border-line rounded-2xl p-[2.5vh_2vw] rotate-[-3deg] shadow-xl">
              <div className="text-[1vw] font-body text-muted">월간 업무일지</div>
              <div className="mt-[0.6vh] text-[1.6vw] font-display font-bold text-ink tracking-tight">
                2026년 4월 운영 보고
              </div>
              <div className="mt-[1.5vh] flex flex-col gap-[1vh]">
                <div className="h-[1vh] rounded bg-line w-[90%]" />
                <div className="h-[1vh] rounded bg-line w-[75%]" />
                <div className="h-[1vh] rounded bg-line w-[85%]" />
              </div>
              <div className="mt-[2vh] grid grid-cols-3 gap-[0.8vw]">
                <div className="bg-primary-soft rounded-lg p-[1vh_0.6vw]">
                  <div className="text-[0.85vw] font-body text-muted">점검</div>
                  <div className="text-[1.4vw] font-display font-black text-primary tracking-tight">
                    18
                  </div>
                </div>
                <div className="bg-primary-soft rounded-lg p-[1vh_0.6vw]">
                  <div className="text-[0.85vw] font-body text-muted">민원</div>
                  <div className="text-[1.4vw] font-display font-black text-primary tracking-tight">
                    32
                  </div>
                </div>
                <div className="bg-primary-soft rounded-lg p-[1vh_0.6vw]">
                  <div className="text-[0.85vw] font-body text-muted">공사</div>
                  <div className="text-[1.4vw] font-display font-black text-primary tracking-tight">
                    4
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute top-[8vh] left-[6vw] right-[0vw] bottom-[2vh] bg-surface border border-line rounded-2xl p-[2.5vh_2vw] rotate-[3deg] shadow-xl">
              <div className="flex items-center justify-between">
                <div className="text-[1vw] font-body text-muted">입주민 공고문</div>
                <div className="text-[0.95vw] font-display font-bold text-primary tracking-[0.15em]">
                  자동
                </div>
              </div>
              <div className="mt-[0.6vh] text-[1.6vw] font-display font-bold text-ink tracking-tight">
                저수조 청소 안내
              </div>
              <div className="mt-[1.5vh] text-[1.05vw] font-body text-text leading-[1.55]">
                안녕하세요, 입주민 여러분. 5월 12일(일) 오전 9시부터 12시까지
                저수조 청소가 진행됩니다. 해당 시간 동안 단수가 발생합니다.
              </div>
              <div className="mt-[1.6vh] flex items-center gap-[0.8vw]">
                <div className="px-[0.8vw] py-[0.4vh] bg-primary text-surface rounded-full text-[0.9vw] font-display font-bold">
                  결재 대기
                </div>
                <div className="text-[0.95vw] font-body text-muted">
                  관리소장 검토 후 발송
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
