// [Task #658] 시설담당 대시보드 좌측 1행 진입 카드.
//   /facility-mandatory-tasks 로 이동한다. 디자인은 다른 단순 진입 카드
//   (notice-templates-entry-widget / building-contracts-summary-widget)와
//   동일한 톤으로 맞춰 시설담당 화면에서 4장이 같은 카드 형태로 정렬된다.

import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { canAccess, getEffectiveRole } from "@/lib/permissions";

const FACILITY_MANDATORY_TASKS_PATH = "/facility-mandatory-tasks";

export default function FacilityMandatoryTasksEntryWidget() {
  const { user } = useAuth();
  if (!user || !canAccess(getEffectiveRole(user), FACILITY_MANDATORY_TASKS_PATH)) {
    return null;
  }

  return (
    <section data-testid="facility-mandatory-tasks-entry-widget" className="h-full">
      <Link href={FACILITY_MANDATORY_TASKS_PATH} className="block h-full">
        <Card
          className="h-full hover-elevate active-elevate-2 cursor-pointer"
          data-testid="facility-mandatory-tasks-entry-card"
        >
          <CardContent className="py-3 px-3 flex items-center gap-3 h-full">
            <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">필수업무</p>
              <p className="text-xs text-muted-foreground">
                법정 의무 업무 — 미처리 시 과태료가 발생할 수 있습니다
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </CardContent>
        </Card>
      </Link>
    </section>
  );
}
