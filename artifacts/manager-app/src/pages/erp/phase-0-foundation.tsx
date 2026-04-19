import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Users, Car, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { canAccess, getEffectiveRole } from "@/lib/permissions";

export default function Phase0FoundationPage() {
  const { user } = useAuth();
  const role = getEffectiveRole(user);
  const canVehicles = canAccess(role, "/vehicles");
  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Phase 0 — 기초·온보딩</h1>
        <p className="text-base text-muted-foreground">
          건물 기본정보·세대·차량 등록을 한 곳에서 관리합니다. (Asset-Manager 통합 진행 중 — 현재는 기존 메뉴로 연결)
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8 text-primary" />
              <div>
                <CardTitle className="text-lg">건물 정보</CardTitle>
                <CardDescription>기본 정보 · 시설 현황</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Link href="/building-info">
              <Button className="w-full" variant="outline">
                바로가기 <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-primary" />
              <div>
                <CardTitle className="text-lg">세대 관리</CardTitle>
                <CardDescription>세대 등록 · 입주자 정보</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Link href="/units">
              <Button className="w-full" variant="outline">
                바로가기 <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Car className="h-8 w-8 text-primary" />
              <div>
                <CardTitle className="text-lg">차량 관리</CardTitle>
                <CardDescription>차량 등록 · 주차 관리</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {canVehicles ? (
              <Link href="/vehicles">
                <Button className="w-full" variant="outline">
                  바로가기 <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <Button className="w-full" variant="outline" disabled>
                권한 없음
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-dashed">
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">
            <strong>예정 기능:</strong> 공공데이터(MOLIT) 자동 조회 · 건축물대장 일괄 가져오기 · API 자동 생성된 세대 일괄 등록
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
