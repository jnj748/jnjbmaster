import { ROUTES } from "./permissions";

// [Task #296] path → 한국어 라벨 매핑.
//   - permissions.ts 의 ROUTES 정의를 기반으로 1회 만든다.
//   - 미등록 경로는 원본 path 를 fallback 으로 그대로 노출(요구사항).
const LABEL_BY_PATH: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const r of ROUTES) m.set(r.path, r.label);
  // 동적 / 사용자 진입 경로 보정.
  m.set("/", "대시보드 홈");
  m.set("/me/credits", "내 크레딧");
  m.set("/me/vendor", "내 업체 정보");
  return m;
})();

export function getMenuLabel(path: string): string {
  // 정확한 매칭 우선.
  const direct = LABEL_BY_PATH.get(path);
  if (direct) return direct;
  // /foo/bar 형태는 가장 긴 prefix 매칭.
  let best: { len: number; label: string } | null = null;
  for (const [p, label] of LABEL_BY_PATH.entries()) {
    if (p === "/") continue;
    if (path === p || path.startsWith(p + "/")) {
      if (!best || p.length > best.len) best = { len: p.length, label };
    }
  }
  return best ? best.label : path;
}
