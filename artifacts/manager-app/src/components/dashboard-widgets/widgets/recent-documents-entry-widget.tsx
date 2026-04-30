// [Task #658] 시설담당 대시보드 좌측 2행 진입 카드.
//   /recent-documents 로 이동한다. 단순 진입 카드 디자인을 다른 시설담당 좌측
//   카드와 동일하게 맞춰 한 줄에 아이콘 + 제목 + 한 줄 설명 + 화살표만 둔다.

import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { FolderOpen, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { canAccess, getEffectiveRole } from "@/lib/permissions";

const RECENT_DOCUMENTS_PATH = "/recent-documents";

export default function RecentDocumentsEntryWidget() {
  const { user } = useAuth();
  if (!user || !canAccess(getEffectiveRole(user), RECENT_DOCUMENTS_PATH)) {
    return null;
  }

  return (
    <section data-testid="recent-documents-entry-widget" className="h-full">
      <Link href={RECENT_DOCUMENTS_PATH} className="block h-full">
        <Card
          className="h-full hover-elevate active-elevate-2 cursor-pointer"
          data-testid="recent-documents-entry-card"
        >
          <CardContent className="py-3 px-3 flex items-center gap-3 h-full">
            <div className="w-9 h-9 rounded-full bg-fuchsia-100 dark:bg-fuchsia-900/30 flex items-center justify-center shrink-0">
              <FolderOpen className="w-4 h-4 text-fuchsia-600 dark:text-fuchsia-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">최근문서함</p>
              <p className="text-xs text-muted-foreground">
                저장된 문서를 다시 보고, 다시 공유·인쇄·기안서로 만듭니다
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </CardContent>
        </Card>
      </Link>
    </section>
  );
}
