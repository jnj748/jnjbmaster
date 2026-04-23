// [Task #312] 카테고리 한글 표시명을 DB 단일 출처에서 읽어 전역에 반영하는 훅.
//   - GET /categories/labels 응답을 캐시(staleTime 10분)한다.
//   - 응답이 들어오면 setRfqCategoryLabelOverrides() 로 공유 헬퍼의 런타임
//     오버라이드를 갱신한다 — 이로써 rfqCategoryLabel() 을 호출하는 모든
//     화면(견적/파트너/시설기사/본사 등)이 동일 라벨을 보게 된다.
//   - 관리자가 라벨을 수정한 뒤 invalidateCategoryLabels() 를 호출하면 즉시
//     다음 화면에서 새 한글명이 반영된다.
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCategoryLabels,
  getListCategoryLabelsQueryKey,
} from "@workspace/api-client-react";
import {
  setRfqCategoryLabelOverrides,
  rfqCategoryLabel,
} from "@workspace/shared/rfq-service-types";

export function useCategoryLabelsBootstrap(): void {
  const { data } = useListCategoryLabels({
    query: { queryKey: getListCategoryLabelsQueryKey(), staleTime: 10 * 60 * 1000 },
  });
  useEffect(() => {
    if (data?.labels) {
      setRfqCategoryLabelOverrides(data.labels);
    }
  }, [data]);
}

export function useCategoryLabels(): {
  labels: Record<string, string>;
  getLabel: (code: string | null | undefined) => string;
} {
  const { data } = useListCategoryLabels({
    query: { queryKey: getListCategoryLabelsQueryKey(), staleTime: 10 * 60 * 1000 },
  });
  return {
    labels: data?.labels ?? {},
    getLabel: rfqCategoryLabel,
  };
}

export function useInvalidateCategoryLabels(): () => void {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: getListCategoryLabelsQueryKey() });
  };
}
