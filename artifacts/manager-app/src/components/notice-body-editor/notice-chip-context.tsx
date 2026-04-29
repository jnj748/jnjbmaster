// [Task #591] 칩 NodeView 가 React context 로부터 토큰별 표시 라벨/값을 읽도록 한다.
//   - 본사 관리자 화면: 모드 'token' — 칩에 [건물명] 같은 라벨이 그대로 보인다.
//   - 관리소장 화면: 모드 'filled' — 칩이 우리 건물의 실제값으로 치환되어 보인다.
//   - resolver 변경(라벨 CSV 수정, 건물 데이터 갱신 등) 시 React 가 NodeView 를
//     자동 재렌더링한다.
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { NOTICE_TOKEN_DEFS, buildNoticeTokenLabels } from "@/lib/notice-layout";

export type NoticeChipMode = "token" | "filled";

export interface NoticeChipResolver {
  /** 모드(라벨만 vs 값 치환). */
  mode: NoticeChipMode;
  /** 토큰별 사람이 읽을 수 있는 라벨 (`건물명` 등). */
  labels: Record<string, string>;
  /** 모드 'filled' 일 때 사용할 토큰별 실제값. */
  values: Record<string, string>;
  /** 칩을 어떻게 보여줄지 계산해 반환한다. */
  display(token: string): string;
}

const DEFAULT_LABELS = buildNoticeTokenLabels();

const NoticeChipResolverContext = createContext<NoticeChipResolver>({
  mode: "token",
  labels: DEFAULT_LABELS,
  values: {},
  display(token) {
    return `[${DEFAULT_LABELS[token] ?? token}]`;
  },
});

interface ProviderProps {
  mode: NoticeChipMode;
  customLabels?: { a?: string; b?: string; c?: string };
  /** 모드 'filled' 에서 사용할 토큰별 값. 빈 값/없음은 [라벨] 로 폴백. */
  values?: Record<string, string | null | undefined>;
  children: ReactNode;
}

export function NoticeChipResolverProvider({
  mode,
  customLabels,
  values,
  children,
}: ProviderProps) {
  const resolver = useMemo<NoticeChipResolver>(() => {
    const labels = buildNoticeTokenLabels(customLabels ?? {});
    const normalizedValues: Record<string, string> = {};
    if (values) {
      for (const [k, v] of Object.entries(values)) {
        if (v != null && String(v).trim() !== "") normalizedValues[k] = String(v);
      }
    }
    return {
      mode,
      labels,
      values: normalizedValues,
      display(token: string): string {
        const labelText = labels[token] ?? token;
        if (mode === "filled") {
          const v = normalizedValues[token];
          if (v && v.trim() !== "") return v;
        }
        // 라벨이 알려져 있지 않은 토큰도 깨짐 없이 보여주기 위해 token 자체를 폴백.
        return `[${labelText}]`;
      },
    };
  }, [mode, customLabels?.a, customLabels?.b, customLabels?.c, JSON.stringify(values ?? {})]);

  return (
    <NoticeChipResolverContext.Provider value={resolver}>
      {children}
    </NoticeChipResolverContext.Provider>
  );
}

export function useNoticeChipResolver(): NoticeChipResolver {
  return useContext(NoticeChipResolverContext);
}

export const NOTICE_CHIP_TOKENS = NOTICE_TOKEN_DEFS;
