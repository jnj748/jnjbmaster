import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Droplet, Zap, Flame, ArrowRight } from "lucide-react";

export default function Phase1MeteringPage() {
  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Phase 1 — 검침·에너지</h1>
        <p className="text-base text-muted-foreground">
          수도·전기·가스 검침 및 이상치 감지. (Asset-Manager 통합 진행 중 — 기존 검침 메뉴로 연결)
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { icon: Droplet, title: "수도 검침", desc: "전월 대비 사용량 비교", color: "text-blue-500" },
          { icon: Zap, title: "전기 검침", desc: "공동전기 자동 안분", color: "text-yellow-500" },
          { icon: Flame, title: "가스 검침", desc: "온수·난방 분리 검침", color: "text-orange-500" },
        ].map((item) => (
          <Card key={item.title}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <item.icon className={`h-8 w-8 ${item.color}`} />
                <div>
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                  <CardDescription>{item.desc}</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="py-6 flex items-center justify-between">
          <div>
            <p className="font-semibold mb-1">기존 검침 입력 화면</p>
            <p className="text-sm text-muted-foreground">현재 등록된 검침 데이터 확인 및 입력</p>
          </div>
          <Link href="/metering">
            <Button>
              검침 화면 열기 <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">
            <strong>예정 기능:</strong> OCR 고지서 자동 판독 · 사용량 이상치 자동 알림 · 50kW 미만 TV수신료 면제 자동 적용
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
