import { useMemo, useRef, useState } from "react";
import { useListBuildingNoticeTemplates } from "@workspace/api-client-react";
import type { BuildingNoticeTemplate } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { useBuilding } from "@/contexts/building-context";
import {
  downloadElementAsPng,
  elementToDocxBlob,
  sharePdfFromElement,
  safeFilename,
} from "@/lib/document-export";
import { useToast } from "@/hooks/use-toast";
import { FileText, Image as ImageIcon, Share2, Printer } from "lucide-react";

// [Task #323] 관리소장 공지문 템플릿
//   - 플랫폼이 만든 템플릿 목록을 카드로 표시.
//   - 카드 선택 → 미리보기 다이얼로그에서 건물정보+사용자 입력값을 채운 본문을 보여주고
//     이미지 저장 / 공유(PDF) / 문서로 저장(.docx) / 인쇄 4가지 액션을 제공.
//   - 본문 HTML 의 placeholder({{...}})는 클라이언트에서 치환한다.

const PLACEHOLDER_RE = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

function todayKR(): string {
  const d = new Date();
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function renderTemplate(html: string, vars: Record<string, string>): string {
  return html.replace(PLACEHOLDER_RE, (_m, key) => {
    const v = vars[String(key)];
    return v != null && v !== "" ? escapeHtml(v) : "";
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseLabels(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

export default function ManagerNoticeTemplatesPage() {
  const { data, isLoading } = useListBuildingNoticeTemplates();
  const templates: BuildingNoticeTemplate[] = data?.templates ?? [];
  const categories = useMemo(() => {
    const set = new Set(templates.map((t) => t.category));
    return ["전체", ...Array.from(set)];
  }, [templates]);
  const [activeCategory, setActiveCategory] = useState("전체");
  const filtered = templates.filter((t) => activeCategory === "전체" || t.category === activeCategory);
  const [selected, setSelected] = useState<BuildingNoticeTemplate | null>(null);

  return (
    <div className="container mx-auto px-4 py-6 space-y-4 max-w-5xl">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">공지문 템플릿</h1>
          <p className="text-sm text-slate-500 mt-1">
            템플릿을 선택하면 우리 건물 정보가 자동으로 채워집니다. 이미지 저장·공유·문서 저장·인쇄가 가능합니다.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap gap-2" data-testid="filter-categories">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setActiveCategory(c)}
            className={`px-3 py-1.5 rounded-full text-xs border ${
              activeCategory === c
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
            data-testid={`filter-category-${c}`}
          >
            {c}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">불러오는 중…</CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">사용할 수 있는 템플릿이 없습니다.</CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3" data-testid="grid-notice-templates">
          {filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelected(t)}
              className="text-left rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400 hover:shadow-sm transition"
              data-testid={`card-template-${t.id}`}
            >
              <div className="flex items-start gap-3">
                <div className="text-3xl shrink-0" aria-hidden>
                  {t.icon ?? "📄"}
                </div>
                <div className="min-w-0">
                  <Badge variant="outline" className="text-[10px] mb-1">{t.category}</Badge>
                  <div className="font-semibold text-sm line-clamp-2">{t.title}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <PreviewDialog template={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function PreviewDialog({
  template,
  onClose,
}: {
  template: BuildingNoticeTemplate;
  onClose: () => void;
}) {
  const { building } = useBuilding();
  const { toast } = useToast();
  const labels = useMemo(() => parseLabels(template.customFieldLabels), [template]);
  const [customA, setCustomA] = useState("");
  const [customB, setCustomB] = useState("");
  const [customC, setCustomC] = useState("");
  const [date, setDate] = useState(todayKR());
  const previewRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<null | "img" | "share" | "doc" | "print">(null);

  const vars: Record<string, string> = {
    buildingName: building?.name ?? "",
    addressFull: building?.addressFull ?? "",
    managementOfficePhone: building?.managementOfficePhone ?? "",
    date,
    customA,
    customB,
    customC,
  };
  const renderedHtml = useMemo(() => renderTemplate(template.bodyHtml, vars), [template, vars]);

  const filename = safeFilename(`${building?.name ?? "건물"}_${template.title}_${date}`);

  async function handleDownloadImage() {
    if (!previewRef.current) return;
    setBusy("img");
    try {
      await downloadElementAsPng(previewRef.current, filename);
      toast({ title: "이미지 저장 완료", description: "PNG 파일이 다운로드되었습니다." });
    } catch (e) {
      toast({ title: "이미지 저장 실패", description: String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function handleShare() {
    if (!previewRef.current) return;
    setBusy("share");
    try {
      const result = await sharePdfFromElement(previewRef.current, filename, template.title);
      if (result === "shared") {
        toast({ title: "공유 시작", description: "원하는 앱으로 보내주세요." });
      } else if (result === "downloaded") {
        toast({ title: "PDF 저장됨", description: "기기에 저장된 PDF를 직접 첨부해 주세요." });
      } else {
        toast({ title: "공유 실패", variant: "destructive" });
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleDownloadDoc() {
    if (!previewRef.current) return;
    setBusy("doc");
    try {
      const blob = await elementToDocxBlob(previewRef.current, template.title);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "문서 저장 완료", description: ".docx 파일이 다운로드되었습니다." });
    } catch (e) {
      toast({ title: "문서 저장 실패", description: String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  function handlePrint() {
    if (!previewRef.current) return;
    setBusy("print");
    try {
      const w = window.open("", "_blank", "width=900,height=1200");
      if (!w) {
        toast({ title: "팝업 차단", description: "브라우저의 팝업 차단을 해제해 주세요.", variant: "destructive" });
        return;
      }
      w.document.write(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(template.title)}</title>` +
          `<style>@page{size:A4;margin:18mm;}body{font-family:'Noto Sans KR','Malgun Gothic',sans-serif;color:#111827;}</style>` +
          `</head><body>${previewRef.current.innerHTML}<script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300);}</script></body></html>`,
      );
      w.document.close();
    } finally {
      setBusy(null);
    }
  }

  return (
    <ResponsiveDialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <ResponsiveDialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            <span className="mr-2">{template.icon ?? "📄"}</span>
            {template.title}
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        {labels.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-1">
            {labels[0] && (
              <div>
                <Label className="text-xs">{labels[0]}</Label>
                <Input
                  value={customA}
                  onChange={(e) => setCustomA(e.target.value)}
                  placeholder={labels[0]}
                  data-testid="input-custom-a"
                />
              </div>
            )}
            {labels[1] && (
              <div>
                <Label className="text-xs">{labels[1]}</Label>
                <Input
                  value={customB}
                  onChange={(e) => setCustomB(e.target.value)}
                  placeholder={labels[1]}
                  data-testid="input-custom-b"
                />
              </div>
            )}
            {labels[2] && (
              <div className="sm:col-span-2">
                <Label className="text-xs">{labels[2]}</Label>
                <Input
                  value={customC}
                  onChange={(e) => setCustomC(e.target.value)}
                  placeholder={labels[2]}
                  data-testid="input-custom-c"
                />
              </div>
            )}
          </div>
        )}
        <div className="px-1">
          <Label className="text-xs">날짜</Label>
          <Input
            value={date}
            onChange={(e) => setDate(e.target.value)}
            data-testid="input-date"
          />
        </div>

        <div className="border rounded bg-white p-2 mx-1" data-testid="container-preview">
          <div
            ref={previewRef}
            className="bg-white p-6"
            data-testid="preview-rendered"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-1 pb-2">
          <Button
            variant="outline"
            onClick={handleDownloadImage}
            disabled={busy !== null}
            data-testid="button-download-image"
          >
            <ImageIcon className="w-4 h-4 mr-1" />이미지 저장
          </Button>
          <Button
            variant="outline"
            onClick={handleShare}
            disabled={busy !== null}
            data-testid="button-share"
          >
            <Share2 className="w-4 h-4 mr-1" />공유
          </Button>
          <Button
            variant="outline"
            onClick={handleDownloadDoc}
            disabled={busy !== null}
            data-testid="button-download-doc"
          >
            <FileText className="w-4 h-4 mr-1" />문서 저장
          </Button>
          <Button
            variant="outline"
            onClick={handlePrint}
            disabled={busy !== null}
            data-testid="button-print"
          >
            <Printer className="w-4 h-4 mr-1" />인쇄
          </Button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
