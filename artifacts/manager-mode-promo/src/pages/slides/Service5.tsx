export default function Service5() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-body text-text">
      <div className="absolute top-[6vh] left-[6vw] flex items-center gap-[1vw]">
        <div className="w-[1.2vw] h-[1.2vw] rounded-md bg-primary" />
        <div className="text-[1.1vw] font-display font-bold tracking-[0.25em] text-primary uppercase">
          Service 05
        </div>
      </div>
      <div className="absolute top-[6vh] right-[6vw] text-[1vw] font-body text-muted">
        08 · 5대 서비스 ⑤
      </div>

      <div className="grid grid-cols-2 h-full">
        <div className="flex flex-col justify-center pl-[7vw] pr-[3vw]">
          <div className="font-display font-black text-primary tracking-tighter text-[10vw] leading-[0.85]">
            05
          </div>

          <h1 className="mt-[3vh] font-display font-black text-ink tracking-tight text-[3.6vw] leading-[1.1]">
            파트너사<br className="hidden" />
            <span className="text-primary"> 비교견적</span>
          </h1>

          <p className="mt-[2.5vh] text-[1.6vw] font-display font-medium text-text leading-[1.4] max-w-[36vw]">
            동일 항목 기준으로 다중 업체 견적을 한 화면에 모아 적정가 판단을
            데이터로 뒷받침합니다.
          </p>

          <div className="mt-[4vh] flex flex-col gap-[1.8vh] max-w-[36vw]">
            <div className="flex gap-[1.2vw] items-start">
              <div className="mt-[0.6vh] w-[0.7vw] h-[0.7vw] rounded-full bg-primary shrink-0" />
              <div className="text-[1.5vw] font-body font-medium text-text leading-[1.5]">
                동일 항목 기준 다중 업체 견적을 한 화면 비교
              </div>
            </div>
            <div className="flex gap-[1.2vw] items-start">
              <div className="mt-[0.6vh] w-[0.7vw] h-[0.7vw] rounded-full bg-primary shrink-0" />
              <div className="text-[1.5vw] font-body font-medium text-text leading-[1.5]">
                과거 단가·평가 이력으로 적정가 자동 추천
              </div>
            </div>
            <div className="flex gap-[1.2vw] items-start">
              <div className="mt-[0.6vh] w-[0.7vw] h-[0.7vw] rounded-full bg-primary shrink-0" />
              <div className="text-[1.5vw] font-body font-medium text-text leading-[1.5]">
                발주·계약·정산까지 한 흐름으로 연결
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex items-center justify-center bg-primary-soft">
          <div className="absolute inset-0 bg-gradient-to-tr from-primary-soft via-bg to-primary-soft opacity-80" />

          <div className="relative w-[34vw] bg-surface border border-line rounded-2xl shadow-xl overflow-hidden">
            <div className="px-[1.5vw] py-[1.6vh] border-b border-line flex items-center justify-between">
              <div>
                <div className="text-[1vw] font-body text-muted">견적 비교</div>
                <div className="text-[1.4vw] font-display font-bold text-ink tracking-tight">
                  옥상방수 보수공사
                </div>
              </div>
              <div className="text-[0.95vw] font-display font-bold text-primary tracking-[0.15em]">
                3개사
              </div>
            </div>

            <div className="grid grid-cols-4 px-[1.5vw] py-[1vh] bg-primary-soft text-[0.95vw] font-display font-bold text-ink tracking-tight">
              <div>업체</div>
              <div>단가</div>
              <div>이력 평점</div>
              <div>추천</div>
            </div>

            <div className="grid grid-cols-4 items-center px-[1.5vw] py-[1.6vh] border-b border-line text-[1.1vw] font-body">
              <div className="font-display font-bold text-ink">A 방수</div>
              <div className="text-text">680만원</div>
              <div className="text-text">4.6</div>
              <div className="text-muted">—</div>
            </div>

            <div className="grid grid-cols-4 items-center px-[1.5vw] py-[1.6vh] border-b border-line bg-primary-soft/40 text-[1.1vw] font-body">
              <div className="font-display font-bold text-primary">B 종합건설</div>
              <div className="font-display font-bold text-ink">620만원</div>
              <div className="text-text">4.8</div>
              <div className="font-display font-bold text-primary">적정가</div>
            </div>

            <div className="grid grid-cols-4 items-center px-[1.5vw] py-[1.6vh] border-b border-line text-[1.1vw] font-body">
              <div className="font-display font-bold text-ink">C 시설관리</div>
              <div className="text-text">740만원</div>
              <div className="text-text">4.4</div>
              <div className="text-muted">—</div>
            </div>

            <div className="px-[1.5vw] py-[1.4vh] bg-ink text-surface flex items-center justify-between">
              <div className="text-[1vw] font-body opacity-75">
                과거 동일 공종 평균 단가
              </div>
              <div className="text-[1.3vw] font-display font-bold tracking-tight">
                640만원 / 200㎡
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
