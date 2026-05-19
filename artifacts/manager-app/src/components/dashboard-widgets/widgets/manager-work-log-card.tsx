import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NotebookPen } from "lucide-react";

export default function ManagerWorkLogCard() {
  return (
    <Card className="manager-phase1-card border-brand bg-brand-light shadow-none" data-testid="manager-work-log-card">
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="manager-phase1-icon-wrap w-10 h-10 rounded-full flex items-center justify-center shrink-0">
            <NotebookPen className="w-5 h-5" />
          </span>
          <h3 className="text-[17px] font-semibold truncate" style={{ color: "var(--brand-dark)" }}>
            오늘 업무일지
          </h3>
        </div>
        <Link href="/work-log?openDaily=1" className="shrink-0">
          <Button
            type="button"
            className="manager-phase1-btn px-4"
            data-testid="button-manager-work-log-write"
          >
            일지 작성하기
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
