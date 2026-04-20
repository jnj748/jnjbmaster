import { Card, CardContent } from "@/components/ui/card";
import { Building2, DoorOpen } from "lucide-react";

interface Summary {
  total: number;
  occupied: number;
  vacant: number;
  maintenance: number;
}

export function UnitsSummaryCards({ summary }: { summary: Summary }) {
  return (
    <div className="grid grid-cols-2 desktop:grid-cols-4 gap-3">
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">전체</p>
              <p className="text-xl font-bold">{summary.total}</p>
            </div>
            <Building2 className="w-5 h-5 text-muted-foreground/50" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">입주</p>
              <p className="text-xl font-bold text-primary">{summary.occupied}</p>
            </div>
            <DoorOpen className="w-5 h-5 text-primary/50" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">공실</p>
              <p className="text-xl font-bold text-amber-500">{summary.vacant}</p>
            </div>
            <DoorOpen className="w-5 h-5 text-amber-500/50" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">정비중</p>
              <p className="text-xl font-bold text-destructive">{summary.maintenance}</p>
            </div>
            <Building2 className="w-5 h-5 text-destructive/50" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
