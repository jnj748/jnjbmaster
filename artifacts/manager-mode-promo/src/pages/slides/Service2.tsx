export default function Service2() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-body text-text">
      <div className="absolute top-[6vh] left-[6vw] flex items-center gap-[1vw]">
        <div className="w-[1.2vw] h-[1.2vw] rounded-md bg-primary" />
        <div className="text-[1.1vw] font-display font-bold tracking-[0.25em] text-primary uppercase">
          Service 02
        </div>
      </div>
      <div className="absolute top-[6vh] right-[6vw] text-[1vw] font-body text-muted">
        05 · 5대 서비스 ②
      </div>

      <div className="grid grid-cols-2 h-full">
        <div className="flex flex-col justify-center pl-[7vw] pr-[3vw]">
          <div className="font-display font-black text-primary tracking-tighter text-[10vw] leading-[0.85]">
            02
          </div>

          <h1 className="mt-[3vh] font-display font-black text-ink tracking-tight text-[3.6vw] leading-[1.1]">
            법정 필수업무·추천 업무<br className="hidden" />
            <span className="text-primary"> 자동알림 처리</span>
          </h1>

          <p className="mt-[2.5vh] text-[1.6vw] font-display font-medium text-text leading-[1.4] max-w-[36vw]">
            기억에 의존하던 일정과 만료일을 시스템이 대신 챙기고, 담당자에게 즉시
            알립니다.
          </p>

          <div className="mt-[4vh] flex flex-col gap-[1.8vh] max-w-[36vw]">
            <div className="flex gap-[1.2vw] items-start">
              <div className="mt-[0.6vh] w-[0.7vw] h-[0.7vw] rounded-full bg-primary shrink-0" />
              <div className="text-[1.5vw] font-body font-medium text-text leading-[1.5]">
                소방·전기·승강기 등 법정 점검 일정 자동 관리
              </div>
            </div>
            <div className="flex gap-[1.2vw] items-start">
              <div className="mt-[0.6vh] w-[0.7vw] h-[0.7vw] rounded-full bg-primary shrink-0" />
              <div className="text-[1.5vw] font-body font-medium text-text leading-[1.5]">
                만료 임박 자격증·보험·계약을 사전 경고
              </div>
            </div>
            <div className="flex gap-[1.2vw] items-start">
              <div className="mt-[0.6vh] w-[0.7vw] h-[0.7vw] rounded-full bg-primary shrink-0" />
              <div className="text-[1.5vw] font-body font-medium text-text leading-[1.5]">
                업무별 담당자에게 모바일 알림 즉시 전송
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex items-center justify-center bg-primary-soft">
          <div className="absolute inset-0 bg-gradient-to-tl from-primary-soft via-bg to-primary-soft opacity-80" />

          <div className="relative w-[32vw] h-[48vh] flex flex-col gap-[1.5vh]">
            <div className="bg-surface border border-line rounded-2xl p-[2vh_1.5vw]">
              <div className="flex items-center justify-between">
                <div className="text-[1vw] font-body text-muted">오늘의 알림</div>
                <div className="text-[1vw] font-display font-bold text-primary">
                  4건
                </div>
              </div>
              <div className="mt-[1.4vh] flex items-center gap-[1vw]">
                <div className="w-[3.2vw] h-[3.2vw] rounded-xl bg-primary-soft flex items-center justify-center">
                  <div className="text-[1.4vw] font-display font-black text-primary">
                    소방
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-[1.3vw] font-display font-bold text-ink tracking-tight">
                    소방시설 작동기능점검
                  </div>
                  <div className="text-[1vw] font-body text-muted">
                    D-7 · 5월 3일 마감
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-surface border border-line rounded-2xl p-[1.8vh_1.5vw]">
              <div className="flex items-center gap-[1vw]">
                <div className="w-[3.2vw] h-[3.2vw] rounded-xl bg-primary-soft flex items-center justify-center">
                  <div className="text-[1.4vw] font-display font-black text-primary">
                    전기
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-[1.3vw] font-display font-bold text-ink tracking-tight">
                    전기안전관리 정기점검
                  </div>
                  <div className="text-[1vw] font-body text-muted">
                    D-21 · 담당 한국전기안전공사
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-surface border border-line rounded-2xl p-[1.8vh_1.5vw]">
              <div className="flex items-center gap-[1vw]">
                <div className="w-[3.2vw] h-[3.2vw] rounded-xl bg-accent/25 flex items-center justify-center">
                  <div className="text-[1.4vw] font-display font-black text-accent">
                    자격
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-[1.3vw] font-display font-bold text-ink tracking-tight">
                    승강기 안전관리자 자격
                  </div>
                  <div className="text-[1vw] font-body text-muted">
                    만료 D-30 · 갱신 필요
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-ink text-surface rounded-2xl p-[1.8vh_1.5vw]">
              <div className="text-[1vw] font-body opacity-70">추천 업무</div>
              <div className="mt-[0.4vh] text-[1.3vw] font-display font-bold tracking-tight">
                저수조 청소 — 지난 청소 후 5개월 경과
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
