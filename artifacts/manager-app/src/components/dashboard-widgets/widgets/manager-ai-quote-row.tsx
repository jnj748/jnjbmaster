import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bot, Hammer } from "lucide-react";

export default function ManagerAiQuoteRow() {
  return (
    <div
      className="grid grid-cols-2 gap-3"
      style={{ gridTemplateColumns: "1fr 1fr" }}
      data-testid="manager-ai-quote-row"
    >
      <Card className="manager-phase1-card border-brand bg-brand-light shadow-none h-full">
        <CardContent className="p-3 flex flex-col gap-3 h-full">
          <div className="flex items-center gap-2 min-w-0">
            <span className="manager-phase1-icon-wrap w-9 h-9 rounded-full flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5" />
            </span>
            <h3 className="text-[17px] font-semibold truncate" style={{ color: "var(--brand-dark)" }}>
              AI 관리비서
            </h3>
          </div>
          <Link href="/ai-assistant" className="mt-auto">
            <Button type="button" className="manager-phase1-btn w-full" data-testid="button-ai-assistant-chat">
              대화하기
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Card className="manager-phase1-card border-brand bg-brand-light shadow-none h-full">
        <CardContent className="p-3 flex flex-col gap-3 h-full">
          <div className="flex items-center gap-2 min-w-0">
            <span className="manager-phase1-icon-wrap w-9 h-9 rounded-full flex items-center justify-center shrink-0">
              <Hammer className="w-5 h-5" />
            </span>
            <h3 className="text-[17px] font-semibold truncate" style={{ color: "var(--brand-dark)" }}>
              업체 견적
            </h3>
          </div>
          <Link href="/rfqs?new=1" className="mt-auto">
            <Button type="button" className="manager-phase1-btn w-full" data-testid="button-request-quote">
              요청하기
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
