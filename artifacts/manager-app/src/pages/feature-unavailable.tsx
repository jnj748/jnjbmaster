import { Smile, Home } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export default function FeatureUnavailablePage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-5">
        <div className="mx-auto w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center">
          <Smile className="w-10 h-10 text-blue-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-lg font-bold">현재 해당 기능은 업데이트 중이에요</h1>
          <p className="text-sm text-muted-foreground">
            빠른 업데이트로 찾아뵙겠습니다.
          </p>
        </div>
        <Button className="w-full" onClick={() => navigate("/")}>
          <Home className="w-4 h-4 mr-2" />
          홈으로 돌아가기
        </Button>
      </div>
    </div>
  );
}
