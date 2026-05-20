import { Link } from "wouter";
import { useListBuildingNoticeTemplates } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { canAccess, getEffectiveRole } from "@/lib/permissions";
import { useAuth } from "@/contexts/auth-context";

const NOTICE_TEMPLATES_PATH = "/notices/templates";

export default function ManagerNoticeFormCard() {
  const { user } = useAuth();
  const role = user ? getEffectiveRole(user) : null;
  const canView = role ? canAccess(role, NOTICE_TEMPLATES_PATH) : false;

  const { data, isLoading } = useListBuildingNoticeTemplates({
    query: { enabled: canView, staleTime: 60_000 },
  });

  if (!canView) return null;

  const latest = data?.templates?.[0];

  return (
    <Card className="manager-phase1-card border-brand bg-brand-light shadow-none" data-testid="manager-notice-form-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <span className="manager-phase1-icon-wrap w-10 h-10 rounded-full flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[17px] font-semibold" style={{ color: "var(--brand-dark)" }}>
              공지문 양식 자동출력
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              공지문 양식을 선택하면 우리 건물에 맞추어 자동으로 출력됩니다
            </p>
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-14 w-full rounded-lg" />
        ) : latest ? (
          <Link
            href={`${NOTICE_TEMPLATES_PATH}?templateId=${latest.id}`}
            className="block rounded-lg border border-brand bg-white/80 px-3 py-3 hover-elevate active-elevate-2"
            data-testid="manager-notice-form-latest"
          >
            <p className="text-[17px] font-medium text-foreground line-clamp-1">{latest.title}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{latest.category}</p>
          </Link>
        ) : (
          <p className="text-sm text-muted-foreground px-1">사용할 수 있는 양식이 없습니다.</p>
        )}

        <Link
          href={NOTICE_TEMPLATES_PATH}
          className="block text-[17px] font-medium text-brand text-right"
          data-testid="manager-notice-form-view-all"
        >
          전체 양식 보기 →
        </Link>
      </CardContent>
    </Card>
  );
}
