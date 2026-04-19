import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, Vote as VoteIcon, ArrowRight } from "lucide-react";

export default function Phase4GovernancePage() {
  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Phase 4 — 민원·투표</h1>
        <p className="text-base text-muted-foreground">
          입주자 민원 처리와 전자투표. (Asset-Manager 통합 진행 중 — 기존 화면 연결)
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <MessageSquare className="h-8 w-8 text-primary" />
              <div>
                <CardTitle className="text-lg">민원 관리</CardTitle>
                <CardDescription>접수 · 배정 · 처리 추적</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Link href="/complaints">
              <Button className="w-full" variant="outline">
                민원 화면 열기 <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <VoteIcon className="h-8 w-8 text-primary" />
              <div>
                <CardTitle className="text-lg">전자투표</CardTitle>
                <CardDescription>관리단 의결 · 투표 진행</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Link href="/voting">
              <Button className="w-full" variant="outline">
                투표 화면 열기 <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card className="border-dashed">
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">
            <strong>예정 기능:</strong> 민원 위험 키워드 자동 탐지 · 본사 자동 에스컬레이션 · 본인인증 기반 e-투표
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
