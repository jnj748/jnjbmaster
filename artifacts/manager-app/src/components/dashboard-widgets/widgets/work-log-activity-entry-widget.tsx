// [Task #658] 시설담당 대시보드 좌측 3행 진입 카드.
//   /work-log?tab=activity (업무일지 페이지의 "처리내역" 탭) 으로 이동한다.
//   업무일지 페이지는 ?tab= 쿼리스트링을 읽어 해당 탭으로 진입하므로 단순 Link 만으로 충분하다.

import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { ListChecks, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { canAccess, getEffectiveRole } from "@/lib/permissions";

const WORK_LOG_PATH = "/work-log";
const WORK_LOG_ACTIVITY_HREF = `${WORK_LOG_PATH}?tab=activity`;

export default function WorkLogActivityEntryWidget() {
  const { user } = useAuth();
  if (!user || !canAccess(getEffectiveRole(user), WORK_LOG_PATH)) {
    return null;
  }

  return (
    <section data-testid="work-log-activity-entry-widget" className="h-full">
      <Link href={WORK_LOG_ACTIVITY_HREF} className="block h-full">
        <Card
          className="h-full hover-elevate active-elevate-2 cursor-pointer"
          data-testid="work-log-activity-entry-card"
        >
          {/* [요청] 가독성 — 아이콘/타이틀/보조설명 한 단계씩 키움.
              관리소장 2행 좌측에서도 동일 위젯을 사용하므로 세 역할 모두 영향. */}
          <CardContent className="py-3.5 px-4 flex items-center gap-3 h-full">
            <div className="w-10 h-10 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center shrink-0">
              <ListChecks className="w-5 h-5 text-sky-600 dark:text-sky-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold">처리 내역</p>
              <p className="text-sm text-muted-foreground">
                업무일지의 모든 기록(처리내역) 을 한눈에 봅니다
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
          </CardContent>
        </Card>
      </Link>
    </section>
  );
}
