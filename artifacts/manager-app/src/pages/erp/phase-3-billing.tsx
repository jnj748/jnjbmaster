import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Receipt, Send, ArrowRight } from "lucide-react";

export default function Phase3BillingPage() {
  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Phase 3 — 고지·수납</h1>
        <p className="text-base text-muted-foreground">
          고지서 발행과 수납 관리. (Asset-Manager 통합 진행 중 — 기존 부과 화면 연결)
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Receipt className="h-8 w-8 text-primary" />
              <div>
                <CardTitle className="text-lg">고지서 발행</CardTitle>
                <CardDescription>월간 부과 내역 확인 및 발행</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Link href="/billing">
              <Button className="w-full" variant="outline">
                기존 부과 화면 <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Send className="h-8 w-8 text-primary" />
              <div>
                <CardTitle className="text-lg">카카오 알림</CardTitle>
                <CardDescription>고지서 일괄 발송 (시뮬레이션)</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button className="w-full" variant="outline" disabled>
              준비 중
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-dashed">
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">
            <strong>예정 기능:</strong> 추세 차트(전월 대비 부과액) · 미납 자동 추적 · 카카오·문자 일괄 발송 연동
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
