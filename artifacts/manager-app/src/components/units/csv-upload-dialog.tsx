import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from "@/components/ui/responsive-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Upload, Download } from "lucide-react";

export interface CsvRow {
  호실번호: string;
  층: string;
  전용면적?: string;
  공용면적?: string;
  용도?: string;
  비고?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  csvData: CsvRow[];
  csvErrors: string[];
  csvParsing: boolean;
  isPending: boolean;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onImport: () => void;
  onDownloadSample: () => void;
}

export function CsvUploadDialog({
  open,
  onOpenChange,
  csvData,
  csvErrors,
  csvParsing,
  isPending,
  onFileChange,
  onImport,
  onDownloadSample,
}: Props) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="w-4 h-4 mr-1" />
          <span className="hidden desktop:inline">CSV 업로드</span>
        </Button>
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>CSV 일괄 등록</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="link" size="sm" className="p-0 h-auto" onClick={onDownloadSample}>
              <Download className="w-3.5 h-3.5 mr-1" />
              샘플 CSV 다운로드
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            CSV 형식: 호실번호, 층, 전용면적, 공용면적, 용도, 비고
          </p>
          <Input type="file" accept=".csv" onChange={onFileChange} disabled={csvParsing} />
          {csvParsing && <p className="text-xs text-muted-foreground">CSV 파싱 중...</p>}
          {csvErrors.length > 0 && (
            <div className="bg-destructive/10 p-3 rounded text-sm space-y-1">
              {csvErrors.map((err, i) => (
                <p key={i} className="text-destructive">{err}</p>
              ))}
            </div>
          )}
          {csvData.length > 0 && (
            <>
              <p className="text-sm font-medium">{csvData.length}개 호실 미리보기</p>
              <div className="max-h-60 overflow-y-auto border rounded">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>호실번호</TableHead>
                      <TableHead>층</TableHead>
                      <TableHead>전용면적</TableHead>
                      <TableHead>공용면적</TableHead>
                      <TableHead>용도</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvData.slice(0, 20).map((row, i) => (
                      <TableRow key={i}>
                        <TableCell>{row["호실번호"]}</TableCell>
                        <TableCell>{row["층"]}</TableCell>
                        <TableCell>{row["전용면적"] || "-"}</TableCell>
                        <TableCell>{row["공용면적"] || "-"}</TableCell>
                        <TableCell>{row["용도"] || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {csvData.length > 20 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    ... 외 {csvData.length - 20}개
                  </p>
                )}
              </div>
              <Button className="w-full" onClick={onImport} disabled={isPending}>
                {isPending ? "등록 중..." : `${csvData.length}개 호실 등록`}
              </Button>
            </>
          )}
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
