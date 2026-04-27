export default function Impact() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-bg font-body text-text px-[8vw] py-[7vh]">
      <div className="flex items-center gap-[1vw]">
        <div className="w-[1.2vw] h-[1.2vw] rounded-md bg-primary" />
        <div className="text-[1.1vw] font-display font-bold tracking-[0.25em] text-primary uppercase">
          Impact
        </div>
        <div className="ml-auto text-[1vw] font-body text-muted">09 · 도입 효과</div>
      </div>

      <h1 className="mt-[2.5vh] font-display font-black text-ink tracking-tight text-[4vw] leading-[1.1] max-w-[70vw]">
        도입 후 기대되는<br className="hidden" />
        <span className="text-primary"> 변화</span>
      </h1>

      <p className="mt-[2vh] text-[1.4vw] font-body text-muted leading-[1.55] max-w-[60vw]">
        아래 수치는 단지 규모·운영 환경에 따라 달라지는 예시 목표치입니다. 도입 컨설팅
        과정에서 단지별 기준값을 함께 설정합니다.
      </p>

      <div className="mt-[5vh] grid grid-cols-4 gap-[2vw]">
        <div className="bg-surface border border-line rounded-2xl p-[3vh_1.8vw]">
          <div className="text-[1vw] font-body text-muted tracking-wide">
            행정·문서 작업
          </div>
          <div className="mt-[1vh] font-display font-black text-ink tracking-tighter leading-[0.95] text-[6vw]">
            70<span className="text-[3vw] text-primary">%</span>
          </div>
          <div className="mt-[1vh] text-[1.2vw] font-display font-bold text-primary tracking-tight">
            시간 절감 목표
          </div>
          <div className="mt-[1vh] text-[1.05vw] font-body text-muted leading-[1.45]">
            보고서·공고문·일지 자동작성 기반
          </div>
        </div>

        <div className="bg-surface border border-line rounded-2xl p-[3vh_1.8vw]">
          <div className="text-[1vw] font-body text-muted tracking-wide">
            법정업무 누락
          </div>
          <div className="mt-[1vh] font-display font-black text-ink tracking-tighter leading-[0.95] text-[6vw]">
            0<span className="text-[3vw] text-primary">건</span>
          </div>
          <div className="mt-[1vh] text-[1.2vw] font-display font-bold text-primary tracking-tight">
            시스템 일정 관리
          </div>
          <div className="mt-[1vh] text-[1.05vw] font-body text-muted leading-[1.45]">
            모든 점검·자격 만료를 사전 알림
          </div>
        </div>

        <div className="bg-surface border border-line rounded-2xl p-[3vh_1.8vw]">
          <div className="text-[1vw] font-body text-muted tracking-wide">
            업체 견적 비교
          </div>
          <div className="mt-[1vh] font-display font-black text-ink tracking-tighter leading-[0.95] text-[6vw]">
            3<span className="text-[3vw] text-primary">+</span>
          </div>
          <div className="mt-[1vh] text-[1.2vw] font-display font-bold text-primary tracking-tight">
            평균 비교 업체 수
          </div>
          <div className="mt-[1vh] text-[1.05vw] font-body text-muted leading-[1.45]">
            동일 기준 적정가 판단 가능
          </div>
        </div>

        <div className="bg-surface border border-line rounded-2xl p-[3vh_1.8vw]">
          <div className="text-[1vw] font-body text-muted tracking-wide">
            비용 집행 추적
          </div>
          <div className="mt-[1vh] font-display font-black text-ink tracking-tighter leading-[0.95] text-[6vw]">
            100<span className="text-[3vw] text-primary">%</span>
          </div>
          <div className="mt-[1vh] text-[1.2vw] font-display font-bold text-primary tracking-tight">
            데이터 기반 투명성
          </div>
          <div className="mt-[1vh] text-[1.05vw] font-body text-muted leading-[1.45]">
            발주부터 정산까지 단일 기록
          </div>
        </div>
      </div>

      <div className="absolute bottom-[5vh] left-[8vw] right-[8vw] flex items-center justify-between text-[1vw] font-body text-muted">
        <div>관리의달인 · 관리소장 모드 도입 효과 (예시 목표치)</div>
        <div>09 / 10</div>
      </div>
    </div>
  );
}
