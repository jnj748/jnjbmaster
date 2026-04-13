import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  useGetDashboardSummary,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ClipboardCheck,
  DollarSign,
  Calculator,
  Coins,
  FileText,
  Send,
  ClipboardList,
  ChevronRight,
  BookOpen,
  BarChart3,
  Settings,
} from "lucide-react";

interface MenuCard {
  path: string;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  badge?: string;
  badgeVariant?: "default" | "destructive" | "secondary" | "outline";
}

export default function AccountingDashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary();

  const menuCards: MenuCard[] = [
    {
      path: "/approvals",
      label: "결재함",
      description: "결재 대기 및 처리 현황",
      icon: ClipboardCheck,
      color: "bg-blue-500",
      badge: summary?.pendingApprovalCount ? `${summary.pendingApprovalCount}건 대기` : undefined,
      badgeVariant: "destructive",
    },
    {
      path: "/spending",
      label: "지출 현황",
      description: "관리비 지출 내역 관리",
      icon: DollarSign,
      color: "bg-emerald-500",
    },
    {
      path: "/tax-schedules",
      label: "세무 일정",
      description: "세금 납부 및 신고 일정",
      icon: Calculator,
      color: "bg-orange-500",
      badge: summary?.pendingTaxCount ? `${summary.pendingTaxCount}건 예정` : undefined,
      badgeVariant: "secondary",
    },
    {
      path: "/drafts",
      label: "기안서",
      description: "기안서 작성 및 관리",
      icon: ClipboardList,
      color: "bg-violet-500",
    },
    {
      path: "/commissions",
      label: "수수료",
      description: "협력업체 수수료 관리",
      icon: Coins,
      color: "bg-amber-500",
    },
    {
      path: "/rfqs",
      label: "견적 요청",
      description: "견적 요청 및 비교",
      icon: Send,
      color: "bg-cyan-500",
    },
    {
      path: "/work-reports",
      label: "작업 검수",
      description: "작업 완료 검수 관리",
      icon: FileText,
      color: "bg-teal-500",
    },
    {
      path: "/daily-reports",
      label: "일간보고",
      description: "일일 업무 보고서",
      icon: BookOpen,
      color: "bg-indigo-500",
    },
    {
      path: "/reports",
      label: "주간보고",
      description: "주간 종합 보고서",
      icon: FileText,
      color: "bg-pink-500",
    },
    {
      path: "/report-system",
      label: "보고 체계",
      description: "보고 체계 설정 및 관리",
      icon: BarChart3,
      color: "bg-slate-500",
    },
    {
      path: "/document-templates",
      label: "서식 관리",
      description: "문서 서식 및 템플릿",
      icon: Settings,
      color: "bg-gray-500",
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <div>
        <h1 className="text-2xl font-bold">관리비회계</h1>
        <p className="text-muted-foreground text-sm mt-1">
          결재, 지출, 세무, 수수료 등 회계 관련 업무를 관리합니다
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-3 sm:p-4 text-center">
            <p className="text-xs text-blue-600 font-medium">결재 대기</p>
            <p className="text-2xl font-bold text-blue-700 mt-1">{summary?.pendingApprovalCount ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-orange-50 border-orange-200">
          <CardContent className="p-3 sm:p-4 text-center">
            <p className="text-xs text-orange-600 font-medium">세무 예정</p>
            <p className="text-2xl font-bold text-orange-700 mt-1">{summary?.pendingTaxCount ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-3 sm:p-4 text-center">
            <p className="text-xs text-emerald-600 font-medium">이번달 지출</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">{summary?.monthlySpendingCount ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {menuCards.map((item) => (
          <Link key={item.path} href={item.path}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${item.color} shrink-0`}>
                  <item.icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">{item.label}</p>
                    {item.badge && (
                      <Badge variant={item.badgeVariant || "secondary"} className="text-[10px]">
                        {item.badge}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
