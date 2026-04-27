export default function Service1() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-body text-text">
      <div className="absolute top-[6vh] left-[6vw] flex items-center gap-[1vw]">
        <div className="w-[1.2vw] h-[1.2vw] rounded-md bg-primary" />
        <div className="text-[1.1vw] font-display font-bold tracking-[0.25em] text-primary uppercase">
          Service 01
        </div>
      </div>
      <div className="absolute top-[6vh] right-[6vw] text-[1vw] font-body text-muted">
        04 · 5대 서비스 ①
      </div>

      <div className="grid grid-cols-2 h-full">
        <div className="flex flex-col justify-center pl-[7vw] pr-[3vw]">
          <div className="font-display font-black text-primary tracking-tighter text-[10vw] leading-[0.85]">
            01
          </div>

          <h1 className="mt-[3vh] font-display font-black text-ink tracking-tight text-[3.6vw] leading-[1.1]">
            건물정보 데이터<br className="hidden" />
            <span className="text-primary"> AI 분석</span>
          </h1>

          <p className="mt-[2.5vh] text-[1.6vw] font-display font-medium text-text leading-[1.4] max-w-[36vw]">
            흩어진 건물 데이터를 한 곳에 모으고, AI가 다음 한 달의 위험을
            먼저 알려줍니다.
          </p>

          <div className="mt-[4vh] flex flex-col gap-[1.8vh] max-w-[36vw]">
            <div className="flex gap-[1.2vw] items-start">
              <div className="mt-[0.6vh] w-[0.7vw] h-[0.7vw] rounded-full bg-primary shrink-0" />
              <div className="text-[1.5vw] font-body font-medium text-text leading-[1.5]">
                도면·설비대장·점검이력을 한 번에 통합 관리
              </div>
            </div>
            <div className="flex gap-[1.2vw] items-start">
              <div className="mt-[0.6vh] w-[0.7vw] h-[0.7vw] rounded-full bg-primary shrink-0" />
              <div className="text-[1.5vw] font-body font-medium text-text leading-[1.5]">
                노후·취약 설비를 자동으로 식별·우선순위화
              </div>
            </div>
            <div className="flex gap-[1.2vw] items-start">
              <div className="mt-[0.6vh] w-[0.7vw] h-[0.7vw] rounded-full bg-primary shrink-0" />
              <div className="text-[1.5vw] font-body font-medium text-text leading-[1.5]">
                다음 달 예상 점검·민원 패턴을 사전 알림
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex items-center justify-center bg-primary-soft">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-soft via-bg to-primary-soft opacity-80" />

          <div className="relative w-[32vw] h-[44vh] flex flex-col gap-[1.5vh]">
            <div className="bg-surface border border-line rounded-2xl p-[2vh_1.5vw] flex items-center justify-between">
              <div>
                <div className="text-[1vw] font-body text-muted">건물 통합 데이터</div>
                <div className="mt-[0.5vh] text-[1.6vw] font-display font-bold text-ink tracking-tight">
                  도면 · 설비대장 · 이력
                </div>
              </div>
              <div className="text-[1vw] font-display font-bold text-primary tracking-[0.2em]">
                AI
              </div>
            </div>

            <div className="grid grid-cols-3 gap-[1vw]">
              <div className="bg-surface border border-line rounded-xl p-[1.6vh_1vw]">
                <div className="text-[0.9vw] font-body text-muted">설비</div>
                <div className="mt-[0.5vh] text-[2vw] font-display font-black text-ink tracking-tight">
                  248
                </div>
              </div>
              <div className="bg-surface border border-line rounded-xl p-[1.6vh_1vw]">
                <div className="text-[0.9vw] font-body text-muted">점검 이력</div>
                <div className="mt-[0.5vh] text-[2vw] font-display font-black text-ink tracking-tight">
                  1.2k
                </div>
              </div>
              <div className="bg-surface border border-line rounded-xl p-[1.6vh_1vw]">
                <div className="text-[0.9vw] font-body text-muted">민원</div>
                <div className="mt-[0.5vh] text-[2vw] font-display font-black text-ink tracking-tight">
                  86
                </div>
              </div>
            </div>

            <div className="bg-ink text-surface rounded-2xl p-[2vh_1.5vw] flex flex-col gap-[0.8vh]">
              <div className="text-[0.95vw] font-body opacity-70">AI 분석 결과</div>
              <div className="flex items-center justify-between">
                <div className="text-[1.3vw] font-display font-bold tracking-tight">
                  지하 1층 펌프실
                </div>
                <div className="text-[0.95vw] font-display font-bold text-accent tracking-wide">
                  주의
                </div>
              </div>
              <div className="text-[1vw] font-body opacity-65 leading-[1.4]">
                3개월 내 정기점검 권장 · 동일 모델 평균 고장 주기 대비 단축
              </div>
            </div>

            <div className="bg-surface border border-line rounded-2xl p-[1.8vh_1.5vw]">
              <div className="text-[0.95vw] font-body text-muted">예측 알림</div>
              <div className="mt-[0.4vh] text-[1.3vw] font-display font-bold text-ink tracking-tight">
                5월 둘째 주 민원 증가 예상
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
