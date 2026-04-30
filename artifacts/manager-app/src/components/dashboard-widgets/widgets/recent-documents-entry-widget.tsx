// [Task #658] 시설담당 대시보드 좌측 2행 진입 카드.
//   /recent-documents 로 이동한다. 단순 진입 카드 디자인을 다른 시설담당 좌측
//   카드와 동일하게 맞춰 한 줄에 아이콘 + 제목 + 한 줄 설명 + 화살표만 둔다.

import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { FolderOpen, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

// [Task #669] /recent-documents 는 permissions.ts 의 ROUTES 화이트리스트에 등록돼
//   있지 않아 canAccess() 가 항상 false 를 돌려줘 시설담당 대시보드에서 카드가
//   한 번도 노출되지 않았다. 해당 페이지(App.tsx)는 별도 역할 가드 없이 모든
//   로그인 사용자에게 라우트가 열려 있으므로(다른 페이지에서도 동일하게 Link 로
//   바로 진입), 위젯 가드는 "로그인 여부" 만으로 충분하다. ROUTES 자체에 항목을
//   추가하면 사이드바·하단탭 메타에까지 영향이 가므로, 위젯 단에서 user 존재만
//   확인하는 방식이 가장 안전한 최소 변경이다.
const RECENT_DOCUMENTS_PATH = "/recent-documents";

export default function RecentDocumentsEntryWidget() {
  const { user } = useAuth();
  if (!user) {
    return null;
  }

  return (
    <section data-testid="recent-documents-entry-widget" className="h-full">
      <Link href={RECENT_DOCUMENTS_PATH} className="block h-full">
        <Card
          className="h-full hover-elevate active-elevate-2 cursor-pointer"
          data-testid="recent-documents-entry-card"
        >
          {/* [요청] 가독성 — 아이콘/타이틀/보조설명 한 단계씩 키움.
              관리소장 2행 좌측에서도 동일 위젯을 사용하므로 세 역할 모두 영향. */}
          <CardContent className="py-3.5 px-4 flex items-center gap-3 h-full">
            <div className="w-10 h-10 rounded-full bg-fuchsia-100 dark:bg-fuchsia-900/30 flex items-center justify-center shrink-0">
              <FolderOpen className="w-5 h-5 text-fuchsia-600 dark:text-fuchsia-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold">최근문서함</p>
              <p className="text-sm text-muted-foreground">
                저장된 문서를 다시 보고, 다시 공유·인쇄·기안서로 만듭니다
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
          </CardContent>
        </Card>
      </Link>
    </section>
  );
}
