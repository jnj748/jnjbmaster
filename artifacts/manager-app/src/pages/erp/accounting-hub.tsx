// [Task #170] 회계 그룹 허브. 시설관리 대시보드와 동일한 컬러 아이콘 카드 그리드.
// 모바일 하단 네비의 "회계" 탭이 이 화면으로 진입하며, 카드를 누르면 회계 그룹의
// 각 메뉴(회계 엔진, 검침/에너지, 고지/수납, 관리비 요약, 관리비 고지서, 민원/투표,
// 지출 현황, 세무 일정, 수수료)로 이동한다.
import { useMemo } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/auth-context";
import { getEffectiveRole, getSidebarSections, GROUP_TITLES } from "@/lib/permissions";

// 카드별 색상 팔레트(시설 허브와 동일한 톤). 항목 순서에 따라 순환 적용.
const COLOR_PALETTE = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-orange-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-amber-500",
  "bg-cyan-500",
  "bg-fuchsia-500",
  "bg-lime-600",
];

const DESCRIPTIONS: Record<string, string> = {
  "/erp/accounting": "월 마감/전표 처리",
  "/erp/metering": "검침 입력 및 사용량 분석",
  "/erp/billing": "고지서 발급·수납 관리",
  "/erp/fees-summary": "AI OCR 기반 관리비 요약",
  "/erp/bills": "월별 청구서 OCR/편집",
  "/erp/governance": "민원·투표 진행 현황",
  "/erp/expenses": "지출 카테고리·증빙",
  "/erp/tax-calendar": "세무·신고 일정",
  "/erp/commissions": "수수료 정산",
};

export default function AccountingHub() {
  const { user } = useAuth();
  const role = getEffectiveRole(user);
  const items = useMemo(() => {
    const sections = getSidebarSections(role);
    const sec = sections.find((s) => s.title === GROUP_TITLES.accounting);
    return sec?.items ?? [];
  }, [role]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">회계 및 관리비</h1>
        <p className="text-muted-foreground text-sm mt-1">
          회계 엔진, 검침, 고지·수납, 관리비 요약 등 회계 업무를 한곳에서 관리하세요
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map((item, idx) => {
          const Icon = item.icon;
          const color = COLOR_PALETTE[idx % COLOR_PALETTE.length];
          const desc = DESCRIPTIONS[item.path] ?? "";
          return (
            <Link key={item.path} href={item.path}>
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
                <CardContent className="p-3 sm:p-4 text-center">
                  <div className={`inline-flex p-2 rounded-lg ${color} mb-2`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <p className="font-semibold text-sm">{item.label}</p>
                  {desc && (
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">{desc}</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
