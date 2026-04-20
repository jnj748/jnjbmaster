import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy, Link2 } from "lucide-react";

interface UnitItem {
  id: number;
  unitNumber: string;
}

interface TokenItem {
  id: number;
  unitLabel: string;
  status: string;
  token: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  units?: UnitItem[];
  tokens?: TokenItem[];
  tokenUnitId: number | null;
  tokenUnitLabel: string;
  setTokenUnitId: (id: number) => void;
  setTokenUnitLabel: (label: string) => void;
  onCreate: () => void;
  onCopy: (token: string) => void;
}

export function TokenDialog({
  open,
  onOpenChange,
  units,
  tokens,
  tokenUnitId,
  tokenUnitLabel,
  setTokenUnitId,
  setTokenUnitLabel,
  onCreate,
  onCopy,
}: Props) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogTrigger asChild>
        <Button variant="outline">
          <Link2 className="w-4 h-4 mr-2" />
          입주자카드 발송
        </Button>
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent className="max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>입주자카드 링크 생성</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            입주민이 직접 입주자카드를 작성할 수 있는 링크를 생성합니다.
            생성된 링크를 카카오톡 등으로 전달해 주세요.
          </p>
          <div>
            <Label>호실 선택</Label>
            <Select
              value={tokenUnitId ? String(tokenUnitId) : ""}
              onValueChange={(v) => {
                const unit = units?.find((u) => u.id === Number(v));
                if (unit) {
                  setTokenUnitId(unit.id);
                  setTokenUnitLabel(unit.unitNumber);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="호실을 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {units?.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.unitNumber}호
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full" onClick={onCreate} disabled={!tokenUnitId || !tokenUnitLabel}>
            링크 생성 및 복사
          </Button>

          {tokens && tokens.length > 0 && (
            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-2">생성된 토큰 목록</p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {tokens.map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-sm p-2 border rounded">
                    <div>
                      <span className="font-medium">{t.unitLabel}호</span>
                      <Badge variant={t.status === "approved" ? "default" : t.status === "submitted" ? "secondary" : "outline"} className="ml-2 text-[10px]">
                        {t.status === "pending" ? "대기" : t.status === "submitted" ? "제출됨" : t.status === "approved" ? "승인" : "반려"}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="sm" className="h-11" onClick={() => onCopy(t.token)}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
