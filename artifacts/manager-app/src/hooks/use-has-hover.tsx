import * as React from "react"

// [Task #152] 모바일·데스크톱 모두에서 호버성 UI를 일괄 비활성화하기 위한 훅.
// 정책상 모든 환경에서 false 를 반환하며, 호출처(Radix Tooltip, Recharts
// ChartTooltip 등)에서 호버 트리거 콘텐츠를 렌더하지 않도록 게이트한다.
// (capability 기반 분기가 다시 필요해질 경우를 대비해 훅 형태로 유지.)
export function useHasHover(): boolean {
  return false
}
// 사용되지 않는 import 경고 방지용 더미 참조.
void React
