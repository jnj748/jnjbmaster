import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { formatDate } from "@/lib/utils";
import { resultOptions } from "@/lib/page-constants/inspections";

interface InspectionLog {
  id: number;
  inspectionDate: string;
  inspector?: string | null;
  result: string;
  memo?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logs: InspectionLog[] | undefined;
}

const resultColor = (r: string) => {
  switch (r) {
    case "good": return "text-green-600";
    case "fair": return "text-yellow-600";
    case "poor": return "text-red-600";
    default: return "";
  }
};

const resultLabel = (r: string) =>
  resultOptions.find((o) => o.value === r)?.label || r;

export function HistoryDialog({ open, onOpenChange, logs }: Props) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>점검 이력</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        {logs && logs.length > 0 ? (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {logs.map((log) => (
              <Card key={log.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{formatDate(log.inspectionDate)}</p>
                      {log.inspector && <p className="text-xs text-muted-foreground">점검자: {log.inspector}</p>}
                    </div>
                    <Badge variant="outline" className={resultColor(log.result)}>
                      {resultLabel(log.result)}
                    </Badge>
                  </div>
                  {log.memo && <p className="text-sm text-muted-foreground mt-2">{log.memo}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">점검 이력이 없습니다</p>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
