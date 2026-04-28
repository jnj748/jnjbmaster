// [Task #503] 매니저 데스크톱 대시보드 3행 좌측에 자리잡는 새 진입 카드.
//   "/notices/templates" 로 이동한다. 디자인은 짝을 이루는 우측 카드(우리 건물
//   계약업체 연락망 = building-contracts-summary-widget) 와 같은 톤으로 맞춘다.
//   매니저 외 역할에서는 노출되지 않도록 권한 체크를 동일 패턴으로 적용한다.

import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { canAccess, getEffectiveRole } from "@/lib/permissions";

const NOTICE_TEMPLATES_PATH = "/notices/templates";

export default function NoticeTemplatesEntryWidget() {
  const { user } = useAuth();
  if (!user || !canAccess(getEffectiveRole(user), NOTICE_TEMPLATES_PATH)) {
    return null;
  }

  return (
    <section data-testid="notice-templates-entry-widget" className="h-full">
      <Link href={NOTICE_TEMPLATES_PATH} className="block h-full">
        <Card
          className="h-full hover-elevate active-elevate-2 cursor-pointer"
          data-testid="notice-templates-entry-card"
        >
          <CardContent className="py-3 px-3 flex items-center gap-3 h-full">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">공지문 템플릿 보기</p>
              <p className="text-xs text-muted-foreground">
                자주 쓰는 공지문을 골라 한 번에 만듭니다
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </CardContent>
        </Card>
      </Link>
    </section>
  );
}
