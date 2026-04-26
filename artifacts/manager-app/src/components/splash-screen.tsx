// 진입 스플래시 화면 — 인증 상태 확인 중(초기 로딩) 동안 보여주는 풀스크린 화면.
//   [Task #438] 회색 배경 + 작은 스피너 → 흰 배경 + 보라 그라디언트 라운드 스퀘어
//     안의 흰색 빌딩 아이콘 + "관리의달인" 워드마크.
//   - BrandLogo 컴포넌트(사이드바 등 다른 사용처)는 손대지 않는다.
//   - PageLoader(페이지 전환용)와도 분리되어 있다.
//   - 색상은 브랜드 보라(--sidebar-primary ≒ hsl(243 100% 68%)) 톤을 재사용한다.
import type { CSSProperties } from "react";

export interface SplashScreenProps {
  ariaLabel?: string;
}

export function SplashScreen({ ariaLabel = "관리의달인" }: SplashScreenProps) {
  // squircle 라운드 사각형 카드. border-radius 를 변의 ~32% 로 잡아
  // Samsung One UI 아이콘 같이 부드러운 스퀴르클 느낌을 낸다.
  // 카드 크기는 모바일/데스크톱 모두 화면 중앙에 자연스럽게 보이도록 고정.
  // 색상은 브랜드 보라 토큰(--sidebar-primary = hsl(243 100% 68%)) 을 기준으로
  //   ±몇 % 명도만 조정한 값. 토큰이 바뀌면 여기도 같이 맞춰주면 된다.
  //   (CSS 의 `hsl(from var(...))` 상대 색상 문법은 일부 환경에서 파싱이
  //    불안정해, 시안 일치를 위해 명시적 HSL 값을 사용한다.)
  const cardStyle: CSSProperties = {
    background:
      "linear-gradient(180deg, hsl(243 100% 75%) 0%, hsl(243 100% 65%) 100%)",
    boxShadow:
      "0 24px 48px -16px hsl(243 100% 68% / 0.35), 0 8px 16px -8px hsl(243 100% 68% / 0.20)",
  };

  return (
    <div
      role="status"
      aria-label={ariaLabel}
      aria-busy="true"
      className="min-h-screen w-full flex flex-col items-center justify-center bg-white px-6"
    >
      {/* 화면 중앙(약간 위쪽)에 정렬: 카드 + 워드마크 */}
      <div className="flex flex-col items-center gap-6 -mt-12 sm:-mt-16">
        <div
          className="w-44 h-44 sm:w-52 sm:h-52 flex items-center justify-center"
          style={{ ...cardStyle, borderRadius: "32%" }}
        >
          {/* 두 개의 빌딩(창문 패턴 포함) — 흰색으로 카드 안에 중앙 배치 */}
          <svg
            viewBox="0 0 100 100"
            width="60%"
            height="60%"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            // 창문(`fill="currentColor"`) 색이 카드 배경과 같은 보라 토큰을 따라가도록.
            style={{ color: "hsl(var(--sidebar-primary))" }}
          >
            {/* 본체(라운드 모서리) — 좌측 큰 빌딩 + 우측 작은 빌딩 */}
            <g fill="#ffffff">
              <rect x="14" y="18" width="40" height="68" rx="4" />
              <rect x="56" y="34" width="30" height="52" rx="4" />
            </g>
            {/* 창문은 카드의 보라 톤이 비치도록 음각으로 표현.
                currentColor 로 두어 부모(div)의 `color: var(--sidebar-primary)` 를 따라간다. */}
            <g fill="currentColor">
              {/* 좌측 빌딩: 3열 × 5행 */}
              <rect x="20" y="24" width="6" height="6" rx="1" />
              <rect x="30" y="24" width="6" height="6" rx="1" />
              <rect x="40" y="24" width="6" height="6" rx="1" />
              <rect x="20" y="34" width="6" height="6" rx="1" />
              <rect x="30" y="34" width="6" height="6" rx="1" />
              <rect x="40" y="34" width="6" height="6" rx="1" />
              <rect x="20" y="44" width="6" height="6" rx="1" />
              <rect x="30" y="44" width="6" height="6" rx="1" />
              <rect x="40" y="44" width="6" height="6" rx="1" />
              <rect x="20" y="54" width="6" height="6" rx="1" />
              <rect x="30" y="54" width="6" height="6" rx="1" />
              <rect x="40" y="54" width="6" height="6" rx="1" />
              <rect x="20" y="64" width="6" height="6" rx="1" />
              <rect x="30" y="64" width="6" height="6" rx="1" />
              <rect x="40" y="64" width="6" height="6" rx="1" />
              {/* 우측 빌딩: 2열 × 4행 */}
              <rect x="62" y="40" width="6" height="6" rx="1" />
              <rect x="74" y="40" width="6" height="6" rx="1" />
              <rect x="62" y="50" width="6" height="6" rx="1" />
              <rect x="74" y="50" width="6" height="6" rx="1" />
              <rect x="62" y="60" width="6" height="6" rx="1" />
              <rect x="74" y="60" width="6" height="6" rx="1" />
              <rect x="62" y="70" width="6" height="6" rx="1" />
              <rect x="74" y="70" width="6" height="6" rx="1" />
            </g>
          </svg>
        </div>

        {/* 워드마크 — 카드 아래 보라색 굵은 글자 */}
        <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-violet-600">
          관리의달인
        </div>
      </div>
    </div>
  );
}

export default SplashScreen;
