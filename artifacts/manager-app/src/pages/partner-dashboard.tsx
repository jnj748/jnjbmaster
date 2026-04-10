import { useListVendors, useListCommissions } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Briefcase, Coins, Building2, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

export default function PartnerDashboard() {
  const { user } = useAuth();
  const { data: vendors, isLoading: vendorsLoading } = useListVendors();
  const { data: commissions, isLoading: commissionsLoading } = useListCommissions();

  const totalCommission = commissions?.reduce((sum, c) => sum + (c.amount ?? 0), 0) ?? 0;
  const pendingCommissions = commissions?.filter((c) => c.status === "pending") ?? [];

  if (vendorsLoading || commissionsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">파트너 대시보드</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {user?.name}님, 파트너사 현황을 확인하세요
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">등록 업체</p>
                <p className="text-2xl font-bold mt-1">{vendors?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">전체 협력업체</p>
              </div>
              <div className="p-2.5 rounded-lg bg-blue-500">
                <Building2 className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">총 수수료</p>
                <p className="text-2xl font-bold mt-1">
                  {totalCommission.toLocaleString()}원
                </p>
                <p className="text-xs text-muted-foreground mt-1">누적 수수료</p>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-500">
                <Coins className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground font-medium">대기 수수료</p>
                <p className="text-2xl font-bold mt-1">{pendingCommissions.length}</p>
                <p className="text-xs text-muted-foreground mt-1">정산 대기</p>
              </div>
              <div className="p-2.5 rounded-lg bg-amber-500">
                <Briefcase className="w-5 h-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-500" />
                등록 업체 현황
              </CardTitle>
              <Link href="/vendors">
                <span className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1">
                  전체보기 <ArrowRight className="w-3 h-3" />
                </span>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {vendors && vendors.length > 0 ? (
              vendors.slice(0, 5).map((vendor) => (
                <div
                  key={vendor.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border"
                >
                  <div>
                    <p className="text-sm font-medium">{vendor.name}</p>
                    <p className="text-xs text-muted-foreground">{vendor.category}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {vendor.type === "contracted" ? "계약" : "비계약"}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                등록된 업체가 없습니다
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Coins className="w-4 h-4 text-emerald-500" />
                최근 수수료
              </CardTitle>
              <Link href="/commissions">
                <span className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1">
                  전체보기 <ArrowRight className="w-3 h-3" />
                </span>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {commissions && commissions.length > 0 ? (
              commissions.slice(0, 5).map((commission) => (
                <div
                  key={commission.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border"
                >
                  <div>
                    <p className="text-sm font-medium">{commission.vendorName}</p>
                    <p className="text-xs text-muted-foreground">
                      {commission.amount?.toLocaleString()}원
                    </p>
                  </div>
                  <Badge
                    variant={commission.status === "paid" ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {commission.status === "paid" ? "정산완료" : "대기"}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                수수료 내역이 없습니다
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
