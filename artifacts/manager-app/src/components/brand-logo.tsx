import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

// 브랜드 로고: "관리의달인" + 빌딩 아이콘.
//   [Task #414] 보라(브랜드 액센트) 통일 + 자동 대비.
//     · 텍스트와 빌딩 아이콘 모두 `currentColor` 를 따라간다.
//     · 컴포넌트 기본 색은 브랜드 보라(text-violet-600 ≒ hsl(243 100% 68%) 액센트 계열).
//     · 사이드바 등 어두운 배경에서는 caller 가 className 으로 `text-white` 를 넘기면
//       바로 흰색 로고로 자동 대비된다.
//   [Task #414] 종전의 틸(민트) 강조는 제거. 로고 전체가 한 가지 톤으로 가독성↑.
export interface BrandLogoProps {
  height?: number; // px
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}

export function BrandLogo({
  height = 32,
  className,
  style,
  ariaLabel = "관리의달인",
}: BrandLogoProps) {
  // viewBox 비율: 240 x 64 (가로:세로 ≈ 3.75:1).
  const width = Math.round(height * (240 / 64));
  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      width={width}
      height={height}
      viewBox="0 0 240 64"
      xmlns="http://www.w3.org/2000/svg"
      // 기본 보라 톤. caller 가 className 에서 text-white 등으로 덮어쓰면
      // tailwind-merge(cn) 가 충돌 클래스(text-*)를 결정적으로 마지막 값으로 해소한다.
      className={cn("text-violet-600", className)}
      style={style}
    >
      {/* 빌딩 아이콘 — 외곽선만 currentColor 로 채우고, 창문은 배경(흰색/어두움)이
          비치도록 비워서 단색 톤과도 잘 어울리게 한다. */}
      <g fill="currentColor">
        {/* 본체(라운드 모서리) */}
        <rect x="6"  y="14" width="22" height="42" rx="3" />
        <rect x="30" y="22" width="14" height="34" rx="3" />
      </g>
      {/* 창문은 배경을 비우는 방식 대신 살짝 투명한 currentColor 로 음각 표현한다.
          배경이 흰색이든 어두움이든 항상 부드럽게 보이도록 opacity 를 사용. */}
      <g fill="#ffffff" opacity="0.92">
        <rect x="10" y="20" width="4" height="4" rx="0.8" />
        <rect x="18" y="20" width="4" height="4" rx="0.8" />
        <rect x="10" y="28" width="4" height="4" rx="0.8" />
        <rect x="18" y="28" width="4" height="4" rx="0.8" />
        <rect x="10" y="36" width="4" height="4" rx="0.8" />
        <rect x="18" y="36" width="4" height="4" rx="0.8" />
        <rect x="34" y="28" width="3" height="3" rx="0.6" />
        <rect x="39" y="28" width="3" height="3" rx="0.6" />
        <rect x="34" y="35" width="3" height="3" rx="0.6" />
        <rect x="39" y="35" width="3" height="3" rx="0.6" />
        <rect x="34" y="42" width="3" height="3" rx="0.6" />
        <rect x="39" y="42" width="3" height="3" rx="0.6" />
      </g>
      {/* 워드마크: "관리의달인" 전체가 currentColor — 한 톤으로 깔끔하게. */}
      <text
        x="56"
        y="44"
        fill="currentColor"
        fontFamily='-apple-system, BlinkMacSystemFont, "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Segoe UI", Roboto, sans-serif'
        fontSize="30"
        fontWeight={800}
        letterSpacing="-0.5"
      >관리의달인</text>
    </svg>
  );
}

export default BrandLogo;
