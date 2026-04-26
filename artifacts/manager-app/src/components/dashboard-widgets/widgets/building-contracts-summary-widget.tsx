import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Phone, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { canAccess, getEffectiveRole } from "@/lib/permissions";

// [Task #450] 홈 화면 "건물관련 계약현황" 위젯을 "우리 건물 계약업체 연락망" 진입 버튼으로 단순화.
// - 기존 진행중/결재대기/갱신 검토 카운터와 "계약 정보를 불러오지 못했습니다" 에러 안내를 모두 제거.
// - 단일 카드 형태 버튼만 노출하고 클릭 시 협력업체 주소록(VENDOR_DIRECTORY_PATH) 으로 이동.
// - 노출 조건은 permissions.ts 의 canAccess() 단일 소스를 그대로 재사용한다. 협력업체 주소록
//   접근 권한이 없는 역할에게는 위젯이 아예 렌더되지 않아 권한 없는 사용자가 빈 페이지로
//   이동하지 않고, permissions.ts 의 access 배열이 바뀌면 위젯 노출도 자동으로 따라간다.

const VENDOR_DIRECTORY_PATH = "/building/vendor-directory";

export default function BuildingContractsSummaryWidget() {
  const { user } = useAuth();
  if (!user || !canAccess(getEffectiveRole(user), VENDOR_DIRECTORY_PATH)) {
    return null;
  }

  return (
    <section data-testid="building-contracts-summary-widget">
      <Link href={VENDOR_DIRECTORY_PATH}>
        <Card
          className="hover-elevate active-elevate-2 cursor-pointer"
          data-testid="vendor-directory-entry-card"
        >
          <CardContent className="py-3 px-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Phone className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">우리 건물 계약업체 연락망</p>
              <p className="text-xs text-muted-foreground">
                협력업체 연락처와 계약 정보를 한눈에 확인합니다
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </CardContent>
        </Card>
      </Link>
    </section>
  );
}
