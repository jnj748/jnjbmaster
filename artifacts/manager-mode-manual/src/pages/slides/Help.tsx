import { SlideShell, FootBar } from "@/components/manual";

export default function Help() {
  return (
    <SlideShell>
      <div className="absolute inset-0 bg-gradient-to-br from-primary-soft via-bg to-bg" />
      <div className="absolute -bottom-[20vh] -right-[10vw] w-[55vw] h-[55vw] rounded-full bg-primary opacity-15 blur-[6vw]" />

      <div className="absolute top-[5vh] left-[5vw] flex items-center gap-[1vw]">
        <div className="w-[1.4vw] h-[1.4vw] rounded-md bg-primary" />
        <div className="text-[1.3vw] font-display font-bold tracking-[0.25em] text-primary uppercase">
          Help
        </div>
      </div>
      <div className="absolute top-[5vh] right-[5vw] text-[1.2vw] font-body text-muted">34 / 34</div>

      <div className="absolute top-[16vh] left-[5vw] right-[5vw]">
        <h1 className="font-display font-black text-ink tracking-tighter text-[6vw] leading-[1]">
          막히실 땐 언제든
        </h1>
        <p className="mt-[2vh] text-[2vw] font-display font-bold text-ink leading-tight max-w-[80vw]">
          AI 관리비서에 한국말로 적기만 하세요. 이 화면에서 어떻게 합니까? 면 됩니다.
        </p>
      </div>

      <div className="absolute top-[44vh] left-[5vw] right-[5vw] grid grid-cols-3 gap-[1.5vw]">
        <div className="bg-surface border border-line rounded-2xl p-[1.6vw]">
          <div className="text-[1.2vw] font-display font-bold tracking-[0.18em] text-primary uppercase">앱 안에서</div>
          <div className="mt-[0.6vh] text-[1.6vw] font-display font-bold text-ink">AI 관리비서</div>
          <div className="mt-[0.4vh] text-[1.15vw] text-text leading-snug">
            컴퓨터 사이드바 ‘AI 관리비서’ 또는 모바일 하단 [AI비서]. 한국말로 한 줄만 적어 주세요.
          </div>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-[1.6vw]">
          <div className="text-[1.2vw] font-display font-bold tracking-[0.18em] text-primary uppercase">전화·메일</div>
          <div className="mt-[0.6vh] text-[1.6vw] font-display font-bold text-ink">고객지원</div>
          <div className="mt-[0.4vh] text-[1.15vw] text-text leading-snug">
            평일 09:00–18:00 / help@manager-master.kr — “관리소장 모드 매뉴얼 N쪽 보고 있는데…”라고 알려 주시면 빠릅니다.
          </div>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-[1.6vw]">
          <div className="text-[1.2vw] font-display font-bold tracking-[0.18em] text-primary uppercase">현장 교육</div>
          <div className="mt-[0.6vh] text-[1.6vw] font-display font-bold text-ink">방문 교육 신청</div>
          <div className="mt-[0.4vh] text-[1.15vw] text-text leading-snug">
            본부장님께 방문 교육을 신청해 주세요. 사용자가 여러 명이면 함께 받는 것이 가장 빠릅니다.
          </div>
        </div>
      </div>

      <div className="absolute bottom-[14vh] left-[5vw] right-[5vw] bg-primary text-surface rounded-2xl p-[1.8vw] flex items-center justify-between gap-[2vw]">
        <div>
          <div className="text-[1.2vw] font-display font-bold tracking-[0.18em] uppercase opacity-80">기억해 주세요</div>
          <div className="mt-[0.4vh] text-[2vw] font-display font-black leading-tight">
            “외울 게 많지 않습니다. 화면이 친절합니다.”
          </div>
        </div>
        <div className="text-[1.2vw] font-display font-bold opacity-90">관리의달인 · Manager-Master</div>
      </div>

      <FootBar leftHint="34 / 34 · 도움말" rightHint="감사합니다." />
    </SlideShell>
  );
}
