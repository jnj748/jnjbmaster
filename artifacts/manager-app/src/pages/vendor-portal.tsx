import { Briefcase, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function VendorPortal() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col">
      <header className="border-b bg-white px-6 py-4 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          돌아가기
        </Button>
        <h1 className="text-lg font-bold">가입업체 포털</h1>
      </header>

      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="py-16 text-center">
            <div className="p-5 rounded-2xl bg-chart-3/10 inline-block mb-6">
              <Briefcase className="w-12 h-12 text-chart-3" />
            </div>
            <h2 className="text-xl font-bold mb-3">업체 포털 준비 중</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              가입업체 전용 로그인 및 대시보드 기능은<br />
              추후 업데이트를 통해 제공될 예정입니다.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
