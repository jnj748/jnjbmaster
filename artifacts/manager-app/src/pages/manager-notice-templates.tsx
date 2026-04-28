import { useEffect, useMemo, useRef, useState } from "react";
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
  elementToPdfBlob,
  sharePdfFromElement,
  safeFilename,
} from "@/lib/document-export";
import { useToast } from "@/hooks/use-toast";
import { FileText, Image as ImageIcon, Share2, Printer } from "lucide-react";
import { NoticeLayoutFrame } from "@/components/notice-layout-frame";
import { useNoticeLayout } from "@/hooks/use-notice-layout";
import { renderNoticeBodyHtml, escapeNoticeHtml } from "@/lib/notice-layout";

// [Task #323] 관리소장 공지문 템플릿
//   - 플랫폼이 만든 템플릿 목록을 카드로 표시.
//   - 카드 선택 → 미리보기 다이얼로그에서 건물정보+사용자 입력값을 채운 본문을 보여주고
//     이미지 저장 / 공유(PDF) / 문서로 저장(.docx) / 인쇄 4가지 액션을 제공.
//   - 본문 HTML 의 placeholder({{...}})는 클라이언트에서 치환한다.

function todayKR(): string {
  const d = new Date();
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// [Task #530] 본문 HTML 토큰 치환 / HTML 이스케이프는 lib/notice-layout 으로 이동.
const renderTemplate = renderNoticeBodyHtml;
const escapeHtml = escapeNoticeHtml;

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

  // [Task #393] 매니저 대시보드 알림 처리 다이얼로그의 "공고문 작성" CTA 에서
  //   /notices/templates?templateId=N 으로 진입한 경우, 목록 로드 후 일치하는 템플릿을
  //   자동 선택해 미리보기 다이얼로그를 띄운다. 일치 항목이 없으면 그냥 목록만 표시.
  //   한 번만 자동 진입하도록 가드 ref 사용.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (typeof window === "undefined") return;
    if (templates.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("templateId");
    if (!raw) {
      autoOpenedRef.current = true;
      return;
    }
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) {
      autoOpenedRef.current = true;
      return;
    }
    const match = templates.find((t) => t.id === id);
    if (match) {
      setSelected(match);
    }
    autoOpenedRef.current = true;
  }, [templates]);

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

function generateNoticeNo(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const seq = String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0");
  return `${y}-${m}${d}-${seq}`;
}

function todayShort(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

// [Task #539] iOS Safari 는 새 탭에서 blob: 스킴의 PDF 표시·자동 인쇄가 불안정하여
//   인쇄 자체가 죽는 경우가 잦다. 이 환경에서는 새 탭을 열지 않고 PDF 를
//   다운로드한 뒤 사용자가 직접 열어 인쇄하도록 폴백한다.
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // 모던 iPadOS 는 Mac 으로 UA 를 보고하지만 터치 이벤트가 있다.
  if (
    ua.includes("Mac") &&
    typeof document !== "undefined" &&
    "ontouchend" in document
  ) {
    return true;
  }
  return false;
}

function triggerPdfDownload(url: string, name: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
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
  // [Task #504] 시스템 공고문 레이아웃 기본값을 받아 본문(템플릿 HTML)을 감싸 출력.
  const { layout: noticeLayout } = useNoticeLayout();
  const labels = useMemo(() => parseLabels(template.customFieldLabels), [template]);
  const [customA, setCustomA] = useState("");
  const [customB, setCustomB] = useState("");
  const [customC, setCustomC] = useState("");
  const [date, setDate] = useState(todayKR());
  const previewRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<null | "img" | "share" | "doc" | "print">(null);
  // 공고NO 는 다이얼로그가 열릴 때 한 번 채번해 캡처/공유 동안 일정하게 유지.
  const [noticeNo] = useState(generateNoticeNo);

  const vars: Record<string, string> = {
    buildingName: building?.name ?? "",
    addressFull: building?.addressFull ?? "",
    managementOfficePhone: building?.managementOfficePhone ?? "",
    // [Task #399] 신규 토큰 — 관리비 문의/시설 방재실 전화번호.
    feeInquiryPhone: building?.feeInquiryPhone ?? "",
    facilitySafetyPhone: building?.facilitySafetyPhone ?? "",
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

  // [Task #539] 인쇄 핸들러를 PDF 기반으로 교체.
  //   - 기존 방식(window.open + innerHTML 복사)은 본문 앱의 Tailwind/전역 스타일이
  //     포함되지 않아 NoticeLayoutFrame 의 박스/표/머리글이 모두 풀려 줄글로
  //     출력되었다. 또한 HTML 인쇄 소스이므로 브라우저가 디폴트로 URL/날짜/
  //     페이지번호를 머리글·바닥글에 찍었다.
  //   - 미리보기 ref 를 elementToPdfBlob 으로 그대로 캡처해 PDF Blob 으로 변환
  //     하면 화면 픽셀 그대로 인쇄되고, PDF 를 인쇄 소스로 주면 브라우저
  //     인쇄 다이얼로그의 머리글/바닥글 디폴트 항목이 표시되지 않는다.
  //   - iOS Safari 등 새 탭에서 blob PDF 표시·인쇄가 불안정한 환경은 다운로드
  //     폴백으로 처리해 인쇄 자체가 죽지 않게 한다.
  async function handlePrint() {
    if (!previewRef.current) return;
    const useDownloadFallback = isIOS();
    let printWin: Window | null = null;
    if (!useDownloadFallback) {
      // 팝업 차단 회피: 사용자 제스처와 같은 동기 컨텍스트에서 새 탭을 미리 연다.
      printWin = window.open("", "_blank");
      if (!printWin) {
        toast({
          title: "팝업 차단",
          description: "브라우저의 팝업 차단을 해제해 주세요.",
          variant: "destructive",
        });
        return;
      }
      try {
        printWin.document.write(
          `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">` +
            `<title>${escapeHtml(template.title)}</title></head>` +
            `<body style="font-family:'Noto Sans KR','Malgun Gothic',sans-serif;color:#111827;margin:24px;">` +
            `인쇄용 PDF 를 준비하고 있습니다…</body></html>`,
        );
        printWin.document.close();
      } catch {
        // 일부 환경에서 about:blank 에 write 가 막힐 수 있음 — 무시.
      }
    }
    setBusy("print");
    try {
      // 캡처 직전 한 프레임 양보 — 라벨/이미지/폰트가 안정될 시간 확보.
      await new Promise((r) => setTimeout(r, 50));
      const blob = await elementToPdfBlob(previewRef.current);
      const url = URL.createObjectURL(blob);
      if (printWin) {
        const winRef = printWin;
        try {
          winRef.location.replace(url);
          // PDF 뷰어 로드 후 인쇄 다이얼로그 자동 호출. 실패해도 PDF 뷰어 자체의
          // 인쇄 버튼으로 인쇄 가능하므로 silent fail.
          setTimeout(() => {
            try {
              winRef.focus();
              winRef.print();
            } catch {
              /* ignore */
            }
          }, 800);
          // blob URL 은 새 탭이 살아있는 동안 유지되어야 하므로 길게 둔 뒤 회수.
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        } catch {
          try {
            winRef.close();
          } catch {
            /* ignore */
          }
          triggerPdfDownload(url, `${filename}.pdf`);
          toast({
            title: "PDF 저장됨",
            description: "저장된 PDF 파일을 열어 인쇄해 주세요.",
          });
        }
      } else {
        // iOS Safari 폴백 — 다운로드된 PDF 를 사용자가 열어 인쇄.
        triggerPdfDownload(url, `${filename}.pdf`);
        toast({
          title: "PDF 저장됨",
          description: "저장된 PDF 파일을 열어 인쇄해 주세요.",
        });
      }
    } catch (e) {
      try {
        printWin?.close();
      } catch {
        /* ignore */
      }
      toast({ title: "인쇄 준비 실패", description: String(e), variant: "destructive" });
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
            style={{ fontFamily: "'Noto Sans KR', 'Malgun Gothic', sans-serif" }}
          >
            <NoticeLayoutFrame
              settings={noticeLayout}
              buildingName={building?.name ?? ""}
              managementOfficePhone={building?.managementOfficePhone ?? undefined}
              feeInquiryPhone={building?.feeInquiryPhone ?? undefined}
              facilitySafetyPhone={building?.facilitySafetyPhone ?? undefined}
              logoUrl={building?.logoUrl ?? null}
              sealUrl={null}
              noticeNo={noticeNo}
              noticeDate={todayShort()}
              title={template.title}
            >
              <div
                className="notice-template-body"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            </NoticeLayoutFrame>
          </div>
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
