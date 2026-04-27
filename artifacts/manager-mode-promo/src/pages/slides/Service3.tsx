export default function Service3() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-body text-text">
      <div className="absolute top-[6vh] left-[6vw] flex items-center gap-[1vw]">
        <div className="w-[1.2vw] h-[1.2vw] rounded-md bg-primary" />
        <div className="text-[1.1vw] font-display font-bold tracking-[0.25em] text-primary uppercase">
          Service 03
        </div>
      </div>
      <div className="absolute top-[6vh] right-[6vw] text-[1vw] font-body text-muted">
        06 · 5대 서비스 ③
      </div>

      <div className="grid grid-cols-2 h-full">
        <div className="flex flex-col justify-center pl-[7vw] pr-[3vw]">
          <div className="font-display font-black text-primary tracking-tighter text-[10vw] leading-[0.85]">
            03
          </div>

          <h1 className="mt-[3vh] font-display font-black text-ink tracking-tight text-[3.6vw] leading-[1.1]">
            사진만 찍으면<br className="hidden" />
            <span className="text-primary"> 업무기록·처리 완료</span>
          </h1>

          <p className="mt-[2.5vh] text-[1.6vw] font-display font-medium text-text leading-[1.4] max-w-[36vw]">
            현장 사진 한 장이 위치·설비·작업 내역을 자동으로 인식해 기록과
            보고서를 동시에 만듭니다.
          </p>

          <div className="mt-[4vh] flex flex-col gap-[1.8vh] max-w-[36vw]">
            <div className="flex gap-[1.2vw] items-start">
              <div className="mt-[0.6vh] w-[0.7vw] h-[0.7vw] rounded-full bg-primary shrink-0" />
              <div className="text-[1.5vw] font-body font-medium text-text leading-[1.5]">
                현장 사진 1장으로 업무 위치·내용 자동 인식
              </div>
            </div>
            <div className="flex gap-[1.2vw] items-start">
              <div className="mt-[0.6vh] w-[0.7vw] h-[0.7vw] rounded-full bg-primary shrink-0" />
              <div className="text-[1.5vw] font-body font-medium text-text leading-[1.5]">
                작업 전·후 사진을 시간순으로 자동 정리
              </div>
            </div>
            <div className="flex gap-[1.2vw] items-start">
              <div className="mt-[0.6vh] w-[0.7vw] h-[0.7vw] rounded-full bg-primary shrink-0" />
              <div className="text-[1.5vw] font-body font-medium text-text leading-[1.5]">
                보고서·이력 카드까지 자동으로 생성·전송
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex items-center justify-center bg-primary-soft">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-soft via-bg to-primary-soft opacity-80" />

          <div className="relative w-[24vw] h-[52vh] bg-ink rounded-[3vw] p-[1.2vh_1vw_2vh] flex flex-col gap-[1.2vh] shadow-2xl">
            <div className="flex justify-center">
              <div className="w-[6vw] h-[0.6vh] rounded-full bg-surface/30" />
            </div>

            <div className="flex items-center justify-between px-[0.5vw]">
              <div className="text-[0.95vw] font-display font-bold text-surface tracking-tight">
                업무 기록
              </div>
              <div className="text-[0.85vw] font-body text-surface opacity-60">
                10:24
              </div>
            </div>

            <div className="bg-surface/10 border border-surface/15 rounded-2xl p-[1.4vh_1vw]">
              <div className="text-[0.85vw] font-body text-surface opacity-60">
                AI 자동 인식
              </div>
              <div className="mt-[0.4vh] text-[1.15vw] font-display font-bold text-surface tracking-tight">
                지하 1층 · 펌프실
              </div>
              <div className="mt-[0.2vh] text-[0.95vw] font-body text-surface opacity-70">
                급수펌프 #2 · 누수 점검
              </div>
            </div>

            <div className="grid grid-cols-2 gap-[0.8vw]">
              <div className="aspect-[4/3] rounded-xl bg-gradient-to-br from-primary to-primary-deep flex items-end p-[0.8vh_0.6vw]">
                <div className="text-[0.8vw] font-display font-bold text-surface">
                  Before
                </div>
              </div>
              <div className="aspect-[4/3] rounded-xl bg-gradient-to-br from-accent to-accent flex items-end p-[0.8vh_0.6vw]">
                <div className="text-[0.8vw] font-display font-bold text-ink">
                  After
                </div>
              </div>
            </div>

            <div className="bg-surface/10 border border-surface/15 rounded-2xl p-[1.4vh_1vw]">
              <div className="text-[0.85vw] font-body text-surface opacity-60">
                자동 작성된 기록
              </div>
              <div className="mt-[0.4vh] text-[1vw] font-body text-surface leading-[1.45]">
                패킹 교체 완료. 누수 정상 종료. 이력 카드에 자동 등록.
              </div>
            </div>

            <div className="mt-auto bg-primary text-surface rounded-2xl p-[1.4vh_1vw] text-center">
              <div className="text-[1.05vw] font-display font-bold tracking-tight">
                보고서 자동 생성 완료
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
