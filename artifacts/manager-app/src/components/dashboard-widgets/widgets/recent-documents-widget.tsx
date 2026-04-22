import { useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useListDrafts,
  useListQuotes,
  useListPlatformAnnouncements,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AuthImage } from "@/components/auth-image";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  FolderOpen,
  Plus,
  NotebookPen,
  FileEdit,
  Receipt,
  Megaphone,
  Image as ImageIcon,
  Camera,
  ImagePlus,
  Loader2,
  X,
  Eye,
  Share2,
  Printer,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { shareDocument } from "@/lib/official-document";

// [Task #250] 최근문서함은 "문서 산출물" 전용으로 정비.
//   - 포함: 기안(draft), 견적(quote), 공고(notice), 외부 업로드(external),
//     일지 스냅샷(journal — /work-log 의 일일 일지가 보고서로 굳어진 것).
//   - 제외: 메모(work_log_entries 단건), 후속조치(alert_actions).
//     이 둘은 /work-log 의 "처리 내역" 탭에서 시간순으로 본다.
type DocKind = "journal" | "draft" | "quote" | "notice" | "external";

interface DocItem {
  id: string;
  kind: DocKind;
  title: string;
  subtitle?: string;
  createdAt: string;
  href?: string;
  thumbnailUrl?: string | null;
}

const KIND_META: Record<DocKind, { label: string; icon: typeof FolderOpen; color: string }> = {
  journal:   { label: "일지 보고서", icon: NotebookPen,   color: "text-emerald-600 bg-emerald-50" },
  draft:     { label: "기안",         icon: FileEdit,      color: "text-violet-600 bg-violet-50" },
  quote:     { label: "견적",         icon: Receipt,       color: "text-orange-600 bg-orange-50" },
  notice:    { label: "공고",         icon: Megaphone,     color: "text-rose-600 bg-rose-50" },
  external:  { label: "외부 업로드",  icon: ImageIcon,     color: "text-slate-600 bg-slate-100" },
};

const MAX_FILE_SIZE_MB = 20;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

interface RecentDocumentsWidgetProps {
  buildingId?: number | null;
}

export default function RecentDocumentsWidget({ buildingId }: RecentDocumentsWidgetProps) {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

  const [uploadOpen, setUploadOpen] = useState(false);

  // 1) drafts/quotes/notices via generated hooks
  const { data: drafts, isLoading: l1 } = useListDrafts();
  const { data: quotes, isLoading: l2 } = useListQuotes();
  const { data: notices, isLoading: l4 } = useListPlatformAnnouncements();

  // 2) daily journals (보고서 스냅샷) via direct fetch
  const { data: journals, isLoading: l6 } = useQuery({
    queryKey: ["recent-doc-journals"],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/daily-journals?limit=20`, { headers: authHeaders });
      if (!r.ok) return [];
      return (await r.json()) as Array<{ id: number; journalDate: string }>;
    },
    enabled: !!token,
    staleTime: 60 * 1000,
  });

  // 3) external documents — 서버가 인증 컨텍스트에서 건물을 결정
  const externalKey = ["recent-doc-external", buildingId ?? null];
  const { data: externals, isLoading: l7 } = useQuery({
    queryKey: externalKey,
    queryFn: async () => {
      const r = await fetch(`${apiBase}/external-documents`, { headers: authHeaders });
      if (!r.ok) return [];
      return (await r.json()) as Array<{
        id: number; title: string; fileUrl: string; mimeType?: string | null; createdAt: string;
      }>;
    },
    enabled: !!token,
    staleTime: 60 * 1000,
  });

  const isLoading = l1 || l2 || l4 || l6 || l7;

  const items = useMemo<DocItem[]>(() => {
    const out: DocItem[] = [];

    for (const d of drafts ?? []) {
      const dd = d as { id: number; title: string; createdAt?: string };
      out.push({
        id: `draft-${dd.id}`, kind: "draft",
        title: dd.title || "기안서",
        createdAt: dd.createdAt ?? new Date(0).toISOString(),
        // [Task #250] 항목별 deep link: 목록 페이지에서 ?id= 를 받아 해당 카드를 강조/스크롤할 수 있도록 한다.
        href: `/drafts?id=${dd.id}#draft-${dd.id}`,
      });
    }
    for (const q of quotes ?? []) {
      const qq = q as { id: number; title?: string; vendorName?: string; createdAt?: string };
      out.push({
        id: `quote-${qq.id}`, kind: "quote",
        title: qq.title || qq.vendorName || "견적",
        subtitle: qq.vendorName,
        createdAt: qq.createdAt ?? new Date(0).toISOString(),
        href: `/quotes?id=${qq.id}#quote-${qq.id}`,
      });
    }
    for (const n of notices ?? []) {
      const nn = n as { id: number; title: string; createdAt?: string };
      out.push({
        id: `notice-${nn.id}`, kind: "notice",
        title: nn.title,
        createdAt: nn.createdAt ?? new Date(0).toISOString(),
        href: `/announcements?id=${nn.id}#notice-${nn.id}`,
      });
    }
    for (const j of journals ?? []) {
      out.push({
        id: `journal-${j.id}`, kind: "journal",
        title: `${j.journalDate} 일일 업무 보고서`,
        createdAt: `${j.journalDate}T00:00:00.000Z`,
        href: "/work-log?tab=daily",
      });
    }
    for (const e of externals ?? []) {
      out.push({
        id: `external-${e.id}`, kind: "external",
        title: e.title,
        createdAt: e.createdAt,
        thumbnailUrl: (e.mimeType ?? "").startsWith("image/") ? e.fileUrl : null,
        // [Task #250] 외부 업로드도 fileUrl 로 즉시 미리보기/인쇄가 가능하도록 href 노출.
        href: e.fileUrl,
      });
    }

    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    return out.slice(0, 8);
  }, [drafts, quotes, notices, journals, externals]);

  // ---------- Upload sheet ----------
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadedMime, setUploadedMime] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState("");

  const { uploadFile, isUploading, progress } = useUpload({
    basePath: `${apiBase}/storage`,
    authToken: token,
    onSuccess: (response) => {
      const servingUrl = `${apiBase}/storage${response.objectPath}`;
      setUploadedUrl(servingUrl);
    },
    onError: (err) => {
      toast({
        title: "업로드 실패",
        description: err instanceof Error ? err.message : "다시 시도해주세요.",
        variant: "destructive",
      });
    },
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      if (f.size > MAX_FILE_SIZE_BYTES) {
        toast({
          title: "파일이 너무 큽니다",
          description: `최대 ${MAX_FILE_SIZE_MB}MB까지 업로드 가능합니다.`,
          variant: "destructive",
        });
        e.target.value = "";
        return;
      }
      setUploadedMime(f.type);
      if (!docTitle) setDocTitle(f.name.replace(/\.[^.]+$/, ""));
      uploadFile(f);
    }
    e.target.value = "";
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${apiBase}/external-documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(authHeaders ?? {}) },
        body: JSON.stringify({
          title: docTitle.trim(),
          fileUrl: uploadedUrl,
          mimeType: uploadedMime,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "외부 문서가 추가되었습니다" });
      queryClient.invalidateQueries({ queryKey: externalKey });
      setUploadedUrl(null);
      setUploadedMime(null);
      setDocTitle("");
      setUploadOpen(false);
    },
    onError: (e: unknown) => {
      toast({
        title: "저장 실패",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    },
  });

  function resetAndClose(open: boolean) {
    setUploadOpen(open);
    if (!open) {
      setUploadedUrl(null);
      setUploadedMime(null);
      setDocTitle("");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-chart-1" />
            최근문서함
          </h2>
          <p className="text-[11px] text-muted-foreground mt-1">
            저장된 문서를 다시 보고, 다시 공유·인쇄할 수 있습니다
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1"
          onClick={() => setUploadOpen(true)}
          data-testid="recent-docs-add-external"
        >
          <Plus className="w-3.5 h-3.5" />
          외부문서
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-sm text-muted-foreground">저장된 문서가 없습니다</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <DocumentRow key={it.id} item={it} />
          ))}
        </div>
      )}

      <Sheet open={uploadOpen} onOpenChange={resetAndClose}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className="text-left">외부문서 추가</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 py-4">
            <div className="space-y-1.5">
              <Label className="text-xs">제목</Label>
              <Input
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="문서 제목"
                data-testid="external-doc-title"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">사진 또는 파일</Label>
              {uploadedUrl ? (
                <div className="relative inline-block">
                  {(uploadedMime ?? "").startsWith("image/") ? (
                    <AuthImage
                      src={uploadedUrl}
                      alt="첨부"
                      className="w-full max-w-[240px] h-auto rounded-lg border object-cover"
                    />
                  ) : (
                    <div className="px-3 py-2 rounded-lg border text-sm">파일이 첨부되었습니다</div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setUploadedUrl(null);
                      setUploadedMime(null);
                    }}
                    aria-label="삭제"
                    className="absolute -top-1.5 -right-1.5 w-7 h-7 flex items-center justify-center bg-transparent p-0"
                  >
                    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-destructive text-destructive-foreground shadow-sm">
                      <X className="w-2.5 h-2.5" strokeWidth={3} />
                    </span>
                  </button>
                </div>
              ) : (
                <>
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFile}
                    className="hidden"
                  />
                  <input
                    ref={galleryInputRef}
                    type="file"
                    onChange={handleFile}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-20 flex flex-col gap-1 border-dashed"
                    onClick={() => setPickerOpen(true)}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span className="text-xs">{progress}%</span>
                      </>
                    ) : (
                      <>
                        <Camera className="w-5 h-5" />
                        <span className="text-xs">촬영 또는 파일 선택</span>
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>
          <SheetFooter className="flex-row gap-2">
            <Button
              type="button"
              variant="ghost"
              className="flex-1"
              onClick={() => resetAndClose(false)}
            >
              취소
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={
                !uploadedUrl || !docTitle.trim() || saveMutation.isPending || isUploading
              }
              onClick={() => saveMutation.mutate()}
              data-testid="external-doc-save"
            >
              {saveMutation.isPending ? "저장 중..." : "저장"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className="text-left">파일 추가</SheetTitle>
          </SheetHeader>
          <div className="grid gap-2 py-4">
            <Button
              type="button"
              variant="outline"
              className="w-full h-14 justify-start gap-3 text-base"
              onClick={() => {
                setPickerOpen(false);
                setTimeout(() => cameraInputRef.current?.click(), 50);
              }}
            >
              <Camera className="w-5 h-5" />
              사진 촬영
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full h-14 justify-start gap-3 text-base"
              onClick={() => {
                setPickerOpen(false);
                setTimeout(() => galleryInputRef.current?.click(), 50);
              }}
            >
              <ImagePlus className="w-5 h-5" />
              파일 선택
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full h-12"
              onClick={() => setPickerOpen(false)}
            >
              취소
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// [Task #250] 문서 행: 좌측 라벨/제목 영역 + 우측 즉시 액션 (다시 보기/공유/인쇄).
//   - 별도 데이터 모델이 없으므로 모든 산출물은 기본 "저장됨" 상태.
//   - "다시 보기": href 로 내부/외부 미리보기 이동.
//   - "다시 공유": Web Share API → 클립보드 폴백.
//   - "다시 인쇄": 미리보기 페이지로 이동 후 사용자가 인쇄(브라우저 인쇄 다이얼로그 트리거 가능 시).
// [Task #250] 행 단위 공유/인쇄 시각은 서버 저장 모델이 없으므로 localStorage 로 best-effort 추적.
//   - key: `recent-doc-action:<id>` → { sharedAt?: ISO, printedAt?: ISO }
function readActionState(id: string): { sharedAt?: string; printedAt?: string } {
  try {
    const raw = window.localStorage.getItem(`recent-doc-action:${id}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function writeActionState(id: string, patch: { sharedAt?: string; printedAt?: string }) {
  try {
    const cur = readActionState(id);
    window.localStorage.setItem(
      `recent-doc-action:${id}`,
      JSON.stringify({ ...cur, ...patch }),
    );
  } catch { /* noop */ }
}

function DocumentRow({ item }: { item: DocItem }) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const [, navigate] = useLocation();
  const [actionState, setActionState] = useState(() => readActionState(item.id));

  const openPreview = () => {
    if (!item.href) return;
    if (/^https?:\/\//i.test(item.href) || item.href.endsWith(".pdf") || item.href.startsWith("/api/") || item.href.startsWith("/objects/")) {
      window.open(item.href, "_blank", "noopener,noreferrer");
    } else {
      navigate(item.href);
    }
  };

  const reshare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const summary = [item.subtitle, formatDate(item.createdAt)].filter(Boolean).join(" · ");
    const result = await shareDocument({ title: `${meta.label} · ${item.title}`, text: summary });
    if (result === "shared" || result === "copied") {
      const now = new Date().toISOString();
      writeActionState(item.id, { sharedAt: now });
      setActionState((s) => ({ ...s, sharedAt: now }));
    }
  };

  const reprint = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.href && (/^https?:\/\//i.test(item.href) || item.href.endsWith(".pdf"))) {
      const w = window.open(item.href, "_blank", "noopener,noreferrer");
      try { w?.focus(); w?.print?.(); } catch { /* noop */ }
    } else if (item.href) {
      navigate(item.href);
      setTimeout(() => { try { window.print(); } catch { /* noop */ } }, 300);
    } else {
      try { window.print(); } catch { /* noop */ }
    }
    const now = new Date().toISOString();
    writeActionState(item.id, { printedAt: now });
    setActionState((s) => ({ ...s, printedAt: now }));
  };

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg border bg-card hover-elevate transition-colors"
      data-testid={`recent-doc-${item.id}`}
    >
      <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${meta.color}`}>
        <Icon className="w-4 h-4" />
      </span>
      <button
        type="button"
        onClick={openPreview}
        className="min-w-0 flex-1 text-left"
        data-testid={`recent-doc-open-${item.id}`}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-semibold text-muted-foreground">{meta.label}</span>
          <Badge variant="outline" className="text-[10px] h-4 px-1 border-emerald-300 text-emerald-700">
            저장됨 · {formatDate(item.createdAt)}
          </Badge>
          {actionState.sharedAt && (
            <Badge variant="outline" className="text-[10px] h-4 px-1 border-blue-300 text-blue-700">
              공유됨 · {formatDate(actionState.sharedAt)}
            </Badge>
          )}
          {actionState.printedAt && (
            <Badge variant="outline" className="text-[10px] h-4 px-1 border-amber-300 text-amber-700">
              인쇄됨 · {formatDate(actionState.printedAt)}
            </Badge>
          )}
        </div>
        <p className="text-sm font-medium truncate">{item.title}</p>
        {item.subtitle && (
          <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
        )}
      </button>
      {item.thumbnailUrl && (
        <AuthImage src={item.thumbnailUrl} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
      )}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={openPreview}
          aria-label="다시 보기"
          data-testid={`recent-doc-view-${item.id}`}
        >
          <Eye className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={reshare}
          aria-label="다시 공유"
          data-testid={`recent-doc-share-${item.id}`}
        >
          <Share2 className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={reprint}
          aria-label="다시 인쇄"
          data-testid={`recent-doc-print-${item.id}`}
        >
          <Printer className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
