// [Task #610] 최근 문서함 — 통합 문서 레지스트리(`GET /api/documents`) 단일 호출 구조.

import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useListDocuments, type DocumentRow, type DocumentKind } from "@workspace/api-client-react";
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
import { AttachmentPickerSheet } from "@/components/attachment-picker-sheet";
import {
  FolderOpen,
  Plus,
  NotebookPen,
  FileEdit,
  Receipt,
  Megaphone,
  Image as ImageIcon,
  CalendarDays,
  CalendarRange,
  CalendarClock,
  ListChecks,
  ClipboardCheck,
  Loader2,
  Upload,
  X,
  Eye,
  Share2,
  Printer,
  FileSignature,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { shareDocument } from "@/lib/official-document";
import { CATEGORY_ICON_CLASS } from "@/lib/category-colors";
import { buildApprovalPrefillUrl } from "@/lib/approval-prefill";

type DocKind = DocumentKind;

const KIND_META: Record<string, { label: string; icon: typeof FolderOpen; color: string }> = {
  journal:             { label: "일일 일지",      icon: NotebookPen,    color: "text-emerald-600 bg-emerald-50" },
  weekly_report:       { label: "주간 보고서",    icon: CalendarRange,  color: "text-emerald-700 bg-emerald-100" },
  monthly_report:      { label: "월간 보고서",    icon: CalendarClock,  color: "text-emerald-800 bg-emerald-100" },
  draft:               { label: "기안 임시",      icon: FileEdit,       color: "text-violet-500 bg-violet-50" },
  approval:            { label: "기안 상신",      icon: FileSignature,  color: "text-violet-700 bg-violet-100" },
  quote_bundle:        { label: "업체선정 기안",  icon: ClipboardCheck, color: "text-violet-800 bg-violet-100" },
  rfq:                 { label: "비교견적",       icon: Receipt,        color: "text-orange-600 bg-orange-50" },
  notice_output:       { label: "공고문",         icon: Megaphone,      color: "text-rose-600 bg-rose-50" },
  alert_action_output: { label: "알림 처리",      icon: ListChecks,     color: "text-amber-600 bg-amber-50" },
  external:            { label: "외부 업로드",    icon: ImageIcon,      color: "text-slate-600 bg-slate-100" },
  quote:               { label: "견적",           icon: Receipt,        color: "text-orange-700 bg-orange-100" },
  contract:            { label: "계약",           icon: FileSignature,  color: "text-blue-700 bg-blue-50" },
};

const KIND_FILTERS: { value: DocKind; label: string }[] = [
  { value: "notice_output",       label: "공고문" },
  { value: "weekly_report",       label: "보고서" },
  { value: "monthly_report",      label: "월보" },
  { value: "approval",            label: "기안서" },
  { value: "journal",             label: "일지" },
  { value: "rfq",                 label: "비교견적" },
  { value: "external",            label: "외부" },
  { value: "alert_action_output", label: "알림 처리" },
];

const ROLE_FILTERS: { value: string; label: string }[] = [
  { value: "manager",        label: "관리소장" },
  { value: "accountant",     label: "경리" },
  { value: "facility_staff", label: "시설과장" },
];

type PeriodChip = "all" | "today" | "week" | "month";

const MAX_FILE_SIZE_MB = 20;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

interface RecentDocumentsWidgetProps {
  buildingId?: number | null;
}

function periodChipToFromIso(chip: PeriodChip): string | undefined {
  if (chip === "all") return undefined;
  const now = new Date();
  const d = new Date(now);
  if (chip === "today") {
    d.setHours(0, 0, 0, 0);
  } else if (chip === "week") {
    d.setDate(d.getDate() - 7);
  } else {
    d.setMonth(d.getMonth() - 1);
  }
  return d.toISOString();
}

export default function RecentDocumentsWidget({ buildingId }: RecentDocumentsWidgetProps) {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

  const [uploadOpen, setUploadOpen] = useState(false);
  const [kindFilter, setKindFilter] = useState<DocKind | "all">("all");
  const [roleFilter, setRoleFilter] = useState<string | "all">("all");
  const [period, setPeriod] = useState<PeriodChip>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const params = useMemo(() => {
    const p: { kind?: string; role?: string; from?: string; q?: string; buildingId?: number; limit?: number } = {
      limit: 50,
    };
    if (kindFilter !== "all") p.kind = kindFilter;
    if (roleFilter !== "all") p.role = roleFilter;
    const from = periodChipToFromIso(period);
    if (from) p.from = from;
    if (searchTerm.trim()) p.q = searchTerm.trim();
    if (buildingId != null) p.buildingId = buildingId;
    return p;
  }, [kindFilter, roleFilter, period, searchTerm, buildingId]);

  const { data, isLoading, refetch } = useListDocuments(params, {
    query: { enabled: !!token, staleTime: 30 * 1000 },
  });
  const items = (data?.items ?? []) as DocumentRow[];

  const externalKey = useMemo(() => ["recent-doc-external", buildingId ?? null] as const, [buildingId]);

  // ---------- Upload sheet ----------
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

  function handleFile(f: File) {
    if (f.size > MAX_FILE_SIZE_BYTES) {
      toast({
        title: "파일이 너무 큽니다",
        description: `최대 ${MAX_FILE_SIZE_MB}MB까지 업로드 가능합니다.`,
        variant: "destructive",
      });
      return;
    }
    setUploadedMime(f.type);
    if (!docTitle) setDocTitle(f.name.replace(/\.[^.]+$/, ""));
    uploadFile(f);
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
      void refetch();
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
            <FolderOpen className={`w-4 h-4 ${CATEGORY_ICON_CLASS.system}`} />
            최근문서함
          </h2>
          <p className="text-[11px] text-muted-foreground mt-1">
            저장된 문서를 다시 보고, 다시 공유·인쇄·기안서로 만들 수 있습니다
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

      {/* 검색 + 필터 영역 */}
      <div className="space-y-2 mb-3">
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="제목 / 부제 검색..."
          className="h-8 text-xs"
          data-testid="recent-docs-search"
        />
        {/* 종류 필터 */}
        <div className="flex flex-wrap gap-1">
          <FilterChip active={kindFilter === "all"} onClick={() => setKindFilter("all")}>
            전체
          </FilterChip>
          {KIND_FILTERS.map((k) => (
            <FilterChip
              key={k.value}
              active={kindFilter === k.value}
              onClick={() => setKindFilter(k.value)}
              testId={`recent-docs-kind-${k.value}`}
            >
              {k.label}
            </FilterChip>
          ))}
        </div>
        {/* 역할 필터 */}
        <div className="flex flex-wrap gap-1">
          <FilterChip active={roleFilter === "all"} onClick={() => setRoleFilter("all")}>
            모든 역할
          </FilterChip>
          {ROLE_FILTERS.map((r) => (
            <FilterChip
              key={r.value}
              active={roleFilter === r.value}
              onClick={() => setRoleFilter(r.value)}
              testId={`recent-docs-role-${r.value}`}
            >
              {r.label}
            </FilterChip>
          ))}
        </div>
        {/* 기간 칩 */}
        <div className="flex flex-wrap gap-1">
          {([
            ["all", "전체 기간"],
            ["today", "오늘"],
            ["week", "이번 주"],
            ["month", "이번 달"],
          ] as Array<[PeriodChip, string]>).map(([v, label]) => (
            <FilterChip
              key={v}
              active={period === v}
              onClick={() => setPeriod(v)}
              testId={`recent-docs-period-${v}`}
            >
              {v === "all" ? <CalendarDays className="w-3 h-3 mr-0.5" /> : null}
              {label}
            </FilterChip>
          ))}
        </div>
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
            <p className="text-sm text-muted-foreground">조건에 맞는 문서가 없습니다</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <DocumentRowView key={it.id} item={it} />
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
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-20 flex flex-col gap-1 border-dashed"
                  onClick={() => setPickerOpen(true)}
                  disabled={isUploading}
                  data-testid="external-doc-picker-trigger"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-xs">{progress}%</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      <span className="text-xs">촬영 · 앨범에서 선택 · 파일에서 선택</span>
                    </>
                  )}
                </Button>
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

      <AttachmentPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="파일 추가"
        description={`이미지·PDF·문서 등 어떤 파일이든 첨부할 수 있어요. (최대 ${MAX_FILE_SIZE_MB}MB)`}
        onPick={handleFile}
        fileOption={{
          accept: "*/*",
          label: "파일에서 선택",
          description: "PDF·문서 등 모든 파일",
        }}
        testId="external-doc-picker"
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={
        "inline-flex items-center text-[11px] px-2 h-6 rounded-full border transition-colors " +
        (active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-muted-foreground border-border hover-elevate")
      }
    >
      {children}
    </button>
  );
}

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
  } catch {
    /* noop */
  }
}

function DocumentRowView({ item }: { item: DocumentRow }) {
  const meta = KIND_META[item.kind] ?? KIND_META.external;
  const Icon = meta.icon;
  const [, navigate] = useLocation();
  const stableId = `doc-${item.id}`;
  const [actionState, setActionState] = useState(() => readActionState(stableId));

  const openPreview = () => {
    if (!item.href) return;
    if (
      /^https?:\/\//i.test(item.href) ||
      item.href.endsWith(".pdf") ||
      item.href.startsWith("/api/") ||
      item.href.startsWith("/objects/")
    ) {
      window.open(item.href, "_blank", "noopener,noreferrer");
    } else {
      navigate(item.href);
    }
  };

  const reshare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const summary = [item.subtitle, formatDate(item.createdAt)].filter(Boolean).join(" · ");
    const result = await shareDocument({
      title: `${meta.label} · ${item.title ?? "(제목 없음)"}`,
      text: summary,
    });
    if (result === "shared" || result === "copied") {
      const now = new Date().toISOString();
      writeActionState(stableId, { sharedAt: now });
      setActionState((s) => ({ ...s, sharedAt: now }));
    }
  };

  const reprint = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.href && (/^https?:\/\//i.test(item.href) || item.href.endsWith(".pdf"))) {
      const w = window.open(item.href, "_blank", "noopener,noreferrer");
      try {
        w?.focus();
        w?.print?.();
      } catch {
        /* noop */
      }
    } else if (item.href) {
      navigate(item.href);
      setTimeout(() => {
        try {
          window.print();
        } catch {
          /* noop */
        }
      }, 300);
    } else {
      try {
        window.print();
      } catch {
        /* noop */
      }
    }
    const now = new Date().toISOString();
    writeActionState(stableId, { printedAt: now });
    setActionState((s) => ({ ...s, printedAt: now }));
  };

  const convertToApproval = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = buildApprovalPrefillUrl({
      id: item.id,
      kind: item.kind,
      sourceTable: item.sourceTable,
      sourceId: item.sourceId,
      title: item.title,
      subtitle: item.subtitle,
      authorId: item.authorId,
      buildingId: item.buildingId,
      href: item.href,
      metadata: item.metadata as Record<string, unknown>,
    });
    navigate(url);
  };

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg border bg-card hover-elevate transition-colors"
      data-testid={`recent-doc-${stableId}`}
    >
      <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${meta.color}`}>
        <Icon className="w-4 h-4" />
      </span>
      <button
        type="button"
        onClick={openPreview}
        className="min-w-0 flex-1 text-left"
        data-testid={`recent-doc-open-${stableId}`}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-semibold text-muted-foreground">{meta.label}</span>
          <Badge
            variant="outline"
            className="text-[10px] h-4 px-1 border-emerald-300 text-emerald-700"
          >
            {item.state} · {formatDate(item.createdAt)}
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
        <p className="text-sm font-medium truncate">{item.title ?? "(제목 없음)"}</p>
        {item.subtitle && (
          <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
        )}
      </button>
      {item.thumbnailUrl && (
        <AuthImage
          src={item.thumbnailUrl}
          alt=""
          className="w-10 h-10 rounded object-cover shrink-0"
        />
      )}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={openPreview}
          aria-label="다시 보기"
          data-testid={`recent-doc-view-${stableId}`}
        >
          <Eye className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={reshare}
          aria-label="다시 공유"
          data-testid={`recent-doc-share-${stableId}`}
        >
          <Share2 className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={reprint}
          aria-label="다시 인쇄"
          data-testid={`recent-doc-print-${stableId}`}
        >
          <Printer className="w-4 h-4" />
        </Button>
        {/* [Task #610] "기안서로 만들기" 표준 진입점 — 기안 자체는 제외. */}
        {item.kind !== "draft" && item.kind !== "approval" && item.kind !== "quote_bundle" && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={convertToApproval}
            aria-label="기안서로 만들기"
            data-testid={`recent-doc-to-approval-${stableId}`}
          >
            <FileSignature className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

