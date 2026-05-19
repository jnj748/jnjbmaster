import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, ChevronRight } from "lucide-react";

export default function AiAssistantEntryWidget() {
  return (
    <section data-testid="ai-assistant-entry-widget" className="h-full">
      <Link href="/ai-assistant" className="block h-full">
        <Card
          className="h-full hover-elevate active-elevate-2 cursor-pointer"
          data-testid="ai-assistant-entry-card"
        >
          <CardContent className="py-2.5 px-3 flex items-center gap-3 h-full">
            <div className="w-9 h-9 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">AI 관리비서</p>
              <p className="text-xs text-muted-foreground truncate">
                궁금한 건 물어보고, 공지·견적·일지도 함께 도와드려요
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </CardContent>
        </Card>
      </Link>
    </section>
  );
}
