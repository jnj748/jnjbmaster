// [Task #495] manager-main-widget 의 handleAlertClick 분기 로직을 별도 훅으로 추출.
//   원본 출처: dashboard-manager-legacy.tsx 의 handleAlertClick (Task #335·#389·
//   #437·#491·#413 등을 거치며 누적된 분기 합치본). 동작은 100% 동일하다.
//   selectedAlert state 자체는 호출 측이 소유하고 setter 만 주입한다 — 이는
//   AlertActionDialog 와 마운트/언마운트 타이밍을 호출 측 컴포넌트와 동기화하기
//   위함이다.

import { useCallback } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  type DashboardAlert,
  ACTIONABLE_ALERT_TYPES,
  ALERT_FALLBACK_ROUTES,
} from "@/lib/alert-utils";

export function useAlertClickHandler(
  setSelectedAlert: (alert: DashboardAlert) => void,
) {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  return useCallback(
    (alert: DashboardAlert) => {
      // [Task #567] (테스트업무) 호실데이터 불러오기 카드 전용 분기(/units 직행)는
      //   카드 자체가 시드에서 제거됨에 따라 함께 제거됐다. 정화조 카드는 일반
      //   처리 모달 흐름(아래 ACTIONABLE_ALERT_TYPES 분기)을 그대로 사용한다.
      if ((ACTIONABLE_ALERT_TYPES as readonly string[]).includes(alert.type)) {
        if (alert.relatedId) {
          setSelectedAlert(alert);
          return;
        }
        const fallback = ALERT_FALLBACK_ROUTES[alert.type];
        if (fallback) {
          navigate(fallback);
          return;
        }
        toast({ title: "처리할 항목 정보를 찾을 수 없습니다", description: alert.title });
        return;
      }

      if (alert.type === "data_destruction") {
        if (!alert.relatedId) {
          toast({ title: "대상 정보를 찾을 수 없습니다", description: alert.title });
          return;
        }
        const isOwner = alert.title.includes("소유자");
        navigate(
          isOwner
            ? `/units?tab=owners&openOwner=${alert.relatedId}`
            : `/tenants?openTenant=${alert.relatedId}`,
        );
        return;
      }

      // [Task #335] 견적 도착 카드 클릭 → /rfqs?openQuote={quoteId} 로 딥링크.
      if (alert.type === "quote_received") {
        if (!alert.relatedId) {
          toast({ title: "견적 정보를 찾을 수 없습니다", description: alert.title });
          return;
        }
        navigate(`/rfqs?openQuote=${alert.relatedId}`);
        return;
      }

      if (
        alert.type === "task_template_mandatory" ||
        alert.type === "task_template_suggested"
      ) {
        if (!alert.relatedId) {
          toast({ title: "처리할 항목 정보를 찾을 수 없습니다", description: alert.title });
          return;
        }
        setSelectedAlert(alert);
        return;
      }

      // [Task #389] 공고문 게시 제안업무: 동일한 액션 모달을 열어 처리완료 → 양식 출력으로 이어진다.
      if (alert.type === "notice_posting") {
        if (!alert.relatedId) {
          toast({ title: "공고문 템플릿 정보를 찾을 수 없습니다", description: alert.title });
          return;
        }
        setSelectedAlert(alert);
        return;
      }

      toast({
        title: "이 항목은 별도 처리 화면이 없습니다",
        description: alert.title,
      });
    },
    [navigate, toast, setSelectedAlert],
  );
}
