import type { CSSProperties } from "react";

// 브랜드 로고: "관리의달인" + 빌딩 아이콘.
// 기존 logo.png 는 "관리의" 가 흰색이라 밝은 배경에서 보이지 않는 문제가 있어,
// 항상 가독성 있는 SVG 컴포넌트로 대체.
//   - "관리의" 는 진한 슬레이트, "달인" 은 브랜드 틸 컬러로 강조.
//   - 빌딩 아이콘은 브랜드 틸. 모두 currentColor 와 무관하게 자기 색을 가짐.
//   - height 픽셀만 받고 가로는 자동(viewBox 비율 유지).
export interface BrandLogoProps {
  height?: number; // px
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}

const BRAND_TEAL = "#14b8a6"; // teal-500
const BRAND_TEXT = "#0f172a"; // slate-900

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
      className={className}
      style={style}
    >
      {/* 빌딩 아이콘 */}
      <g fill={BRAND_TEAL}>
        {/* 본체 */}
        <rect x="6"  y="14" width="22" height="42" rx="2" />
        <rect x="30" y="22" width="14" height="34" rx="2" />
        {/* 창문 (어둡게 비워서 윤곽 표현) */}
        <g fill="#ffffff" opacity="0.95">
          <rect x="10" y="20" width="4" height="4" />
          <rect x="18" y="20" width="4" height="4" />
          <rect x="10" y="28" width="4" height="4" />
          <rect x="18" y="28" width="4" height="4" />
          <rect x="10" y="36" width="4" height="4" />
          <rect x="18" y="36" width="4" height="4" />
          <rect x="34" y="28" width="3" height="3" />
          <rect x="39" y="28" width="3" height="3" />
          <rect x="34" y="35" width="3" height="3" />
          <rect x="39" y="35" width="3" height="3" />
          <rect x="34" y="42" width="3" height="3" />
          <rect x="39" y="42" width="3" height="3" />
        </g>
      </g>
      {/* 텍스트: "관리의" (진한 슬레이트) + " 달인" (브랜드 틸) */}
      <text
        x="56"
        y="44"
        fontFamily='-apple-system, BlinkMacSystemFont, "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Segoe UI", Roboto, sans-serif'
        fontSize="30"
        fontWeight={800}
        letterSpacing="-0.5"
      >
        <tspan fill={BRAND_TEXT}>관리의</tspan>
        <tspan fill={BRAND_TEAL} dx="6">달인</tspan>
      </text>
    </svg>
  );
}

export default BrandLogo;
