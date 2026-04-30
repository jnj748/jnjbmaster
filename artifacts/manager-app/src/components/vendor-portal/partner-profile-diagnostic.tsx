// [Task #682 review-fix #2] PartnerProfileDiagnostic 를 partner-dashboard 에서 분리.
//   파트너 RFQ 탭의 빈 상태(vendor-rfq-list)에서도 같은 안내를 재사용한다.

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { AlertTriangle, Settings } from "lucide-react";

export interface PartnerProfileDiagnosticProps {
  vendor: {
    category?: string | null;
    subCategories?: string | null;
    sido?: string | null;
    sigungu?: string | null;
  };
  subCatList: string[];
  regionLabel: string | null;
  compact?: boolean;
}

export function PartnerProfileDiagnostic({
  vendor,
  subCatList,
  regionLabel,
  compact,
}: PartnerProfileDiagnosticProps) {
  const missing: string[] = [];
  if (!vendor.category) missing.push("주 카테고리");
  if (!regionLabel) missing.push("활동지역");
  const isWarning = missing.length > 0;
  const titleText = isWarning
    ? `매칭이 약합니다 — ${missing.join(", ")}이(가) 비어 있어요`
    : "표시되는 RFQ 가 적다면 내 등록 정보를 확인해 보세요";
  return (
    <Card
      className={
        isWarning
          ? "border-amber-300 bg-amber-50/70"
          : "border-slate-200 bg-slate-50/50"
      }
      data-testid="partner-profile-diagnostic"
    >
      <CardContent className={compact ? "p-3 space-y-2" : "p-4 space-y-2"}>
        <div className="flex items-start gap-2">
          <AlertTriangle
            className={`shrink-0 ${compact ? "w-3.5 h-3.5 mt-0.5" : "w-4 h-4 mt-0.5"} ${
              isWarning ? "text-amber-600" : "text-slate-500"
            }`}
          />
          <div className="flex-1 min-w-0">
            <p
              className={`font-medium ${compact ? "text-xs" : "text-sm"}`}
              data-testid="partner-diagnostic-title"
            >
              {titleText}
            </p>
            <p
              className={`text-muted-foreground ${
                compact ? "text-[11px]" : "text-xs"
              } mt-0.5`}
            >
              내 카테고리: <strong>{vendor.category ?? "—"}</strong>
              {subCatList.length > 0 ? ` (+${subCatList.length}개 부카테고리)` : ""}
              {" · "}활동지역: <strong>{regionLabel ?? "—"}</strong>
            </p>
            <p
              className={`text-muted-foreground ${
                compact ? "text-[10px]" : "text-[11px]"
              } mt-1 leading-relaxed`}
            >
              관리소장이 같은 카테고리·지역의 RFQ 를 올렸을 때만 내 화면에 도착합니다.
              범위를 넓히려면 업체 정보에서 부카테고리·활동지역을 늘려 주세요.
            </p>
          </div>
        </div>
        <div className="flex justify-end">
          <Link href="/me/vendor">
            <Button
              size="sm"
              variant={isWarning ? "default" : "outline"}
              data-testid="partner-diagnostic-edit"
            >
              <Settings className="w-3.5 h-3.5 mr-1" />
              업체 정보 수정
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

/** vendor row → diagnostic 입력값 변환 헬퍼. */
export function deriveDiagnosticInputs(vendor: {
  subCategories?: string | null;
  sido?: string | null;
  sigungu?: string | null;
}): { subCatList: string[]; regionLabel: string | null } {
  const subCatList = (vendor.subCategories ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const regionLabel =
    [vendor.sido, vendor.sigungu].filter(Boolean).join(" ") || null;
  return { subCatList, regionLabel };
}
