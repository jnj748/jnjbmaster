import { useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useListDrafts,
  useListQuotes,
  useListAlertActions,
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
  StickyNote,
  NotebookPen,
  CheckCircle2,
  FileEdit,
  Receipt,
  Megaphone,
  Image as ImageIcon,
  Camera,
  ImagePlus,
  Loader2,
  X,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

type DocKind = "memo" | "journal" | "follow_up" | "draft" | "quote" | "notice" | "external";

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
  memo:      { label: "메모",     icon: StickyNote,    color: "text-amber-600 bg-amber-50" },
  journal:   { label: "일지",     icon: NotebookPen,   color: "text-emerald-600 bg-emerald-50" },
  follow_up: { label: "후속조치", icon: CheckCircle2,  color: "text-blue-600 bg-blue-50" },
  draft:     { label: "기안",     icon: FileEdit,      color: "text-violet-600 bg-violet-50" },
  quote:     { label: "견적",     icon: Receipt,       color: "text-orange-600 bg-orange-50" },
  notice:    { label: "공고",     icon: Megaphone,     color: "text-rose-600 bg-rose-50" },
  external:  { label: "외부",     icon: ImageIcon,     color: "text-slate-600 bg-slate-100" },
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

  // 1) drafts/quotes/alert-actions/notices via generated hooks
  const { data: drafts, isLoading: l1 } = useListDrafts();
  const { data: quotes, isLoading: l2 } = useListQuotes();
  const { data: alertActions, isLoading: l3 } = useListAlertActions();
  const { data: notices, isLoading: l4 } = useListPlatformAnnouncements();

  // 2) work-logs (메모) via direct fetch
  const { data: workLogs, isLoading: l5 } = useQuery({
    queryKey: ["recent-doc-worklogs"],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/work-logs`, { headers: authHeaders });
      if (!r.ok) return [];
      return (await r.json()) as Array<{
        id: number; memo: string; category?: string; photoUrl?: string | null;
        occurredAt: string; occurredDate?: string;
      }>;
    },
    enabled: !!token,
    staleTime: 60 * 1000,
  });

  // 3) daily journals via direct fetch
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

  // 4) external documents — 서버가 인증 컨텍스트에서 건물을 결정하므로 별도 파라미터 불필요
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

  const isLoading = l1 || l2 || l3 || l4 || l5 || l6 || l7;

  const items = useMemo<DocItem[]>(() => {
    const out: DocItem[] = [];

    for (const d of drafts ?? []) {
      const dd = d as { id: number; title: string; createdAt?: string };
      out.push({
        id: `draft-${dd.id}`, kind: "draft",
        title: dd.title || "기안서",
        createdAt: dd.createdAt ?? new Date(0).toISOString(),
        href: "/drafts",
      });
    }
    for (const q of quotes ?? []) {
      const qq = q as { id: number; title?: string; vendorName?: string; createdAt?: string };
      out.push({
        id: `quote-${qq.id}`, kind: "quote",
        title: qq.title || qq.vendorName || "견적",
        subtitle: qq.vendorName,
        createdAt: qq.createdAt ?? new Date(0).toISOString(),
        href: "/quotes",
      });
    }
    for (const a of alertActions ?? []) {
      const aa = a as {
        id: number; alertTitle?: string; notes?: string | null;
        createdAt?: string; closeUpPhotoUrl?: string | null;
      };
      if (!aa.notes && !aa.alertTitle) continue;
      out.push({
        id: `action-${aa.id}`, kind: "follow_up",
        title: aa.alertTitle || "후속조치",
        subtitle: aa.notes ?? undefined,
        createdAt: aa.createdAt ?? new Date(0).toISOString(),
        href: "/tasks",
        thumbnailUrl: aa.closeUpPhotoUrl ?? null,
      });
    }
    for (const n of notices ?? []) {
      const nn = n as { id: number; title: string; createdAt?: string };
      out.push({
        id: `notice-${nn.id}`, kind: "notice",
        title: nn.title,
        createdAt: nn.createdAt ?? new Date(0).toISOString(),
        href: "/announcements",
      });
    }
    for (const w of workLogs ?? []) {
      out.push({
        id: `worklog-${w.id}`, kind: "memo",
        title: w.memo?.slice(0, 60) || "업무 메모",
        subtitle: w.category,
        createdAt: w.occurredAt,
        href: "/work-log",
        thumbnailUrl: w.photoUrl ?? null,
      });
    }
    for (const j of journals ?? []) {
      out.push({
        id: `journal-${j.id}`, kind: "journal",
        title: `${j.journalDate} 업무일지`,
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
        href: undefined,
      });
    }

    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    return out.slice(0, 8);
  }, [drafts, quotes, alertActions, notices, workLogs, journals, externals]);

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
            예전 작성문서를 찾아보세요
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
            <p className="text-sm text-muted-foreground">아직 작성된 문서가 없습니다</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((it) => {
            const meta = KIND_META[it.kind];
            const Icon = meta.icon;
            const inner = (
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-card hover-elevate active-elevate-2 transition-colors">
                <span
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${meta.color}`}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {meta.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      · {formatDate(it.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm font-medium truncate">{it.title}</p>
                  {it.subtitle && (
                    <p className="text-xs text-muted-foreground truncate">{it.subtitle}</p>
                  )}
                </div>
                {it.thumbnailUrl && (
                  <AuthImage
                    src={it.thumbnailUrl}
                    alt=""
                    className="w-10 h-10 rounded object-cover shrink-0"
                  />
                )}
              </div>
            );
            return it.href ? (
              <Link key={it.id} href={it.href} data-testid={`recent-doc-${it.id}`}>
                {inner}
              </Link>
            ) : (
              <div key={it.id} data-testid={`recent-doc-${it.id}`}>
                {inner}
              </div>
            );
          })}
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
                    className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
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
