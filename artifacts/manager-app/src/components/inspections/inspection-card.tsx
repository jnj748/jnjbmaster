import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, Printer, CheckCircle, History, Edit, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { Inspection } from "@workspace/api-client-react";
import { categoryOptions, statusOptions } from "@/lib/page-constants/inspections";

interface Props {
  item: Inspection;
  onComplete: (id: number) => void;
  onHistory: (id: number) => void;
  onEdit: (item: Inspection) => void;
  onDelete: (id: number) => void;
  onNotice: (item: Inspection) => void;
}

const categoryLabel = (c: string) =>
  categoryOptions.find((o) => o.value === c)?.label || c;
const statusLabel = (s: string) =>
  statusOptions.find((o) => o.value === s)?.label || s;
const statusColor = (s: string) => {
  switch (s) {
    case "overdue": return "destructive";
    case "upcoming": return "secondary";
    case "scheduled": return "outline";
    case "completed": return "outline";
    default: return "outline" as const;
  }
};

export function InspectionCard({ item, onComplete, onHistory, onEdit, onDelete, onNotice }: Props) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-accent/10">
              <Shield className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="font-medium">{item.name}</p>
              <p className="text-sm text-muted-foreground">{categoryLabel(item.category)}</p>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant={statusColor(item.status) as "default" | "secondary" | "destructive" | "outline"}>
                  {statusLabel(item.status)}
                </Badge>
                {item.legalCycleMonths && (
                  <span className="text-xs text-muted-foreground">
                    {item.legalCycleMonths}개월 주기
                  </span>
                )}
                {!item.legalCycleMonths && (
                  <span className="text-xs text-muted-foreground">
                    연 {item.frequencyPerYear}회
                  </span>
                )}
              </div>
              {item.status === "scheduled" && (
                <Button
                  variant="outline"
                  className="mt-2 h-11"
                  onClick={() => onNotice(item)}
                >
                  <Printer className="w-3.5 h-3.5 mr-1" />
                  안내문 출력
                </Button>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">{formatDate(item.nextDueDate)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {item.advanceAlertDays}일 전 알림
            </p>
            <div className="flex flex-wrap gap-1 mt-2 justify-end">
              {item.status !== "completed" && (
                <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => onComplete(item.id)} title="완료 처리">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => onHistory(item.id)} title="점검 이력">
                <History className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => onEdit(item)} title="수정">
                <Edit className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => onDelete(item.id)} title="삭제">
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
