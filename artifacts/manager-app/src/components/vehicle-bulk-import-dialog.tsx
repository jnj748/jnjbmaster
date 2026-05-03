// [Task #797] 차량 대량 등록 — CSV 파일 또는 텍스트 붙여넣기로 헤더를 받고
//   AI(서버 측 사전) 가 헤더를 표준 필드명으로 매핑한 뒤 한 번에 INSERT.
//   사용자는 매핑 결과만 확인하면 되며, 호실/번호 외에는 빈 값을 허용한다.
import { useMemo, useState } from "react";
import { Sparkles, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { apiSend } from "@/lib/residents-extras-api";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImported: () => void;
}

const FIELDS: { key: string; label: string }[] = [
  { key: "unit", label: "호실" },
  { key: "vehicleNumber", label: "차량번호" },
  { key: "vehicleType", label: "차종" },
  { key: "vehicleColor", label: "색상" },
  { key: "ownerName", label: "소유자" },
  { key: "ownerContact", label: "연락처" },
  { key: "manufacturer", label: "제조사" },
  { key: "modelYear", label: "연식" },
  { key: "engineDisplacement", label: "배기량" },
  { key: "isElectric", label: "전기차" },
  { key: "stickerNumber", label: "스티커번호" },
  { key: "notes", label: "비고" },
];

function parseCsvOrTsv(text: string): string[][] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim().length > 0);
  return lines.map((line) => {
    const sep = line.includes("\t") ? "\t" : ",";
    return line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
  });
}

export function VehicleBulkImportDialog({ open, onOpenChange, onImported }: Props) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setText("");
    setHeaders([]);
    setDataRows([]);
    setMapping({});
  };

  const handleFile = async (file: File) => {
    const t = await file.text();
    setText(t);
  };

  const analyze = async () => {
    if (!text.trim() || !token) return;
    setBusy(true);
    try {
      const rows = parseCsvOrTsv(text);
      if (rows.length < 2) {
        toast({ title: "데이터가 부족합니다", description: "헤더 + 1행 이상이 필요합니다.", variant: "destructive" });
        return;
      }
      const hdrs = rows[0];
      const body = rows.slice(1);
      setHeaders(hdrs);
      setDataRows(body);
      const result = await apiSend<{ mapping: Record<string, string | null> }>(
        `/vehicles/suggest-mapping`,
        "POST",
        token,
        { headers: hdrs },
      );
      setMapping(result.mapping);
    } catch (e) {
      toast({ title: "분석 실패", description: String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const previewRows = useMemo(() => {
    if (headers.length === 0) return [] as Record<string, string>[];
    return dataRows.slice(0, 200).map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        const target = mapping[h];
        if (target) obj[target] = row[i] ?? "";
      });
      return obj;
    });
  }, [headers, dataRows, mapping]);

  const validCount = useMemo(
    () => previewRows.filter((r) => r.unit && r.vehicleNumber).length,
    [previewRows],
  );

  const submit = async () => {
    if (!token || validCount === 0) return;
    setBusy(true);
    try {
      const rows = previewRows
        .filter((r) => r.unit && r.vehicleNumber)
        .map((r) => ({
          ...r,
          modelYear: r.modelYear ? Number(r.modelYear) : undefined,
          engineDisplacement: r.engineDisplacement ? Number(r.engineDisplacement) : undefined,
          isElectric: /(true|y|예|o|1|전기)/i.test(r.isElectric ?? ""),
        }));
      const res = await apiSend<{ inserted: number }>(`/vehicles/bulk-import`, "POST", token, { rows });
      toast({ title: `${res.inserted}건 등록되었습니다` });
      onImported();
      onOpenChange(false);
      reset();
    } catch (e) {
      toast({ title: "등록 실패", description: String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-600" /> 차량 대량 등록 (AI 컬럼 매핑)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>CSV 파일 또는 텍스트 붙여넣기</Label>
            <div className="flex gap-2">
              <Input
                type="file"
                accept=".csv,.tsv,.txt"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <Button onClick={analyze} disabled={busy || !text.trim()}>
                {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                AI 매핑
              </Button>
            </div>
            <Textarea
              placeholder="엑셀/시트에서 복사한 행을 붙여넣어도 됩니다. 첫 줄은 헤더로 인식합니다."
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          {headers.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">컬럼 매핑 결과</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-56 overflow-auto pr-1">
                {headers.map((h) => (
                  <div key={h} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground min-w-[6rem] truncate">{h}</span>
                    <Select
                      value={mapping[h] ?? "__none__"}
                      onValueChange={(v) =>
                        setMapping((prev) => ({ ...prev, [h]: v === "__none__" ? null : v }))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">(무시)</SelectItem>
                        {FIELDS.map((f) => (
                          <SelectItem key={f.key} value={f.key}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="text-sm">
                총 <Badge variant="outline">{dataRows.length}</Badge> 행 중{" "}
                <Badge>{validCount}</Badge> 행이 호실+차량번호를 갖춰 등록 가능합니다.
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button onClick={submit} disabled={busy || validCount === 0}>
            <Upload className="w-4 h-4 mr-1" /> {validCount}건 등록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
