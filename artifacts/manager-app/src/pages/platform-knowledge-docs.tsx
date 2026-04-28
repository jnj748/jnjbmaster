import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Plus, Pencil, Trash2, Save, X, CheckCircle2, Upload, Paperclip, FileDown, FileText, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  useListPlatformKnowledgeDocs,
  useCreatePlatformKnowledgeDoc,
  useUpdatePlatformKnowledgeDoc,
  useDeletePlatformKnowledgeDoc,
  getListPlatformKnowledgeDocsQueryKey,
  type PlatformKnowledgeDoc,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { ROLE_LABELS } from "@workspace/shared/role-labels";

// 플랫폼 전용 — 모든 관리소장 AI 비서가 공통으로 참조할
// 법령/개정안/운영 가이드 등을 등록·관리한다.
// AI 가 실제로 사용하는 것은 "본문(bodyText)" 이며, 첨부 파일은 사용자 다운로드용 참조본이다.

interface DraftState {
  id: number | null;
  title: string;
  category: string;
  summary: string;
  bodyText: string;
  // [Task #533] 사용자가 본문을 직접 수정한 경우 자동 추출 결과로 덮어쓰지 않는다.
  bodyTextDirty: boolean;
  fileUrl: string;
  fileName: string;
  // [Task #533] 첨부 파일의 SHA-256 해시. 중복 감지에 사용.
  fileHash: string | null;
  // [Task #533] 본문 자동 추출 결과 안내 배너에 사용할 메타.
  extractor: "txt" | "pdf" | "docx" | "unsupported" | "failed" | null;
  effectiveDate: string;
  version: string;
  isActive: boolean;
  // [Task #283] 노출 대상 역할. 빈 배열이면 전체 공통.
  targetRoles: string[];
}

const CATEGORY_PRESETS = ["법령", "개정안", "운영가이드", "안전관리", "회계/세무", "기타"];

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "manager", label: ROLE_LABELS.manager },
  { value: "accountant", label: ROLE_LABELS.accountant },
  { value: "facility_staff", label: ROLE_LABELS.facility_staff },
  { value: "partner", label: ROLE_LABELS.partner },
  { value: "hq_executive", label: ROLE_LABELS.hq_executive },
];

// [Task #533] 허용 확장자/크기 — 서버 스토리지가 큰 파일도 받지만, 본문 추출
// 파이프라인이 200MB 를 넘으면 unsupported 로 떨어지므로 동일 한도를 둔다.
const ALLOWED_EXTS = [".pdf", ".hwp", ".hwpx", ".doc", ".docx", ".txt"] as const;
const ALLOWED_EXT_RE = /\.(pdf|hwp|hwpx|doc|docx|txt)$/i;
const MAX_FILE_BYTES = 200 * 1024 * 1024; // 200MB

function emptyDraft(defaultRole?: string): DraftState {
  return {
    id: null,
    title: "",
    category: "법령",
    summary: "",
    bodyText: "",
    bodyTextDirty: false,
    fileUrl: "",
    fileName: "",
    fileHash: null,
    extractor: null,
    effectiveDate: "",
    version: "",
    isActive: true,
    targetRoles: defaultRole ? [defaultRole] : [],
  };
}

// [Task #533] 다중 파일 큐 처리 — 새 자료 작성 모드에서 한 번에 드롭한
//   여러 파일을 차례로 업로드/추출/저장하기 위한 항목 상태.
type QueueStatus =
  | "pending"
  | "uploading"
  | "extracting"
  | "saving"
  | "done"
  | "duplicate" // 서버 409 — 사용자에게 "그래도 등록" 결정 요청 중
  | "failed";

interface QueueItem {
  id: string;
  file: File;
  status: QueueStatus;
  progress: number; // 0~100
  message: string;
  // 중복 감지 시 서버가 반환한 기존 자료 정보.
  duplicateOf?: { id: number; title: string };
  // 중복 확인 후 저장 재시도 시 다시 PUT/extract 를 돌리지 않도록 캐시.
  cached?: {
    objectPath: string;
    fileHash: string | null;
    bodyText: string;
    extractor: string;
  };
}

function uniqueId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `q_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

// ApiError(customFetch) 의 데이터는 e.data 에 있다. 일부 axios 스타일
// 호출은 e.response?.data 를 쓸 수 있어 양쪽을 모두 살펴본다.
function readErrorData(e: unknown): { error?: string; piiTypes?: string[]; requiresConfirmation?: boolean; existing?: { id: number; title: string }; status?: number } {
  if (!e || typeof e !== "object") return {};
  const anyErr = e as { data?: Record<string, unknown>; response?: { data?: Record<string, unknown> }; status?: number };
  const data = (anyErr.data ?? anyErr.response?.data ?? {}) as Record<string, unknown>;
  return {
    error: typeof data.error === "string" ? data.error : undefined,
    piiTypes: Array.isArray(data.piiTypes) ? (data.piiTypes as string[]) : undefined,
    requiresConfirmation: data.requiresConfirmation === true,
    existing: typeof data.existing === "object" && data.existing
      ? data.existing as { id: number; title: string }
      : undefined,
    status: typeof anyErr.status === "number" ? anyErr.status : undefined,
  };
}

export default function PlatformKnowledgeDocsPage() {
  const queryClient = useQueryClient();
  const { token } = useAuth();
  // [Task #283] ?role= 컨텍스트가 있으면 generated 훅 대신 role 쿼리를 포함한 직접 fetch 로
  //   서버측 역할 필터링을 적용한다. (codegen 갱신을 피하기 위한 미니멀 우회)
  const _roleFromUrl = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("role") ?? ""
    : "";
  const generated = useListPlatformKnowledgeDocs({ query: { enabled: !_roleFromUrl } });
  const [roleScopedDocs, setRoleScopedDocs] = useState<typeof generated.data>([] as never);
  const [roleScopedLoading, setRoleScopedLoading] = useState(false);
  useEffect(() => {
    if (!_roleFromUrl) return;
    let cancelled = false;
    setRoleScopedLoading(true);
    fetch(`${import.meta.env.BASE_URL ?? "/"}api/platform/knowledge-docs?role=${encodeURIComponent(_roleFromUrl)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (!cancelled) setRoleScopedDocs(d); })
      .finally(() => { if (!cancelled) setRoleScopedLoading(false); });
    return () => { cancelled = true; };
  }, [_roleFromUrl, token]);
  const docs = (_roleFromUrl ? roleScopedDocs : generated.data) ?? [];
  const isLoading = _roleFromUrl ? roleScopedLoading : generated.isLoading;
  const create = useCreatePlatformKnowledgeDoc();
  const update = useUpdatePlatformKnowledgeDoc();
  const remove = useDeletePlatformKnowledgeDoc();

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState("");
  // 서버 PII 감지 → 사용자가 "확인했습니다" 동의 후 confirmPii=true 로 재전송.
  const [piiWarning, setPiiWarning] = useState<string[] | null>(null);
  const [piiConfirmed, setPiiConfirmed] = useState(false);
  // [Task #533] 단일 파일 업로드 시 서버 409(중복) 대응 상태.
  const [duplicateNotice, setDuplicateNotice] = useState<{ id: number; title: string } | null>(null);
  // [Task #533] 다중 파일 큐(새 자료 작성 모드 전용).
  const [queue, setQueue] = useState<QueueItem[]>([]);
  // [Task #533] 인라인 파일 검증 오류(허용 확장자/크기 위반).
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  // [Task #533] 드롭존 시각 강조 토글.
  const [dragActive, setDragActive] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const BASE = import.meta.env.BASE_URL ?? "/";
  const API_BASE = `${BASE}api`;

  const sorted = useMemo(() => {
    const list = [...docs].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    const f = filter.trim().toLowerCase();
    if (!f) return list;
    return list.filter(
      (d) =>
        d.title.toLowerCase().includes(f) ||
        d.category.toLowerCase().includes(f) ||
        (d.summary ?? "").toLowerCase().includes(f),
    );
  }, [docs, filter]);

  function startNew() {
    setError("");
    setInfo("");
    setPiiWarning(null);
    setPiiConfirmed(false);
    setDuplicateNotice(null);
    setFileErrors([]);
    setQueue([]);
    setDraft(emptyDraft(_roleFromUrl || undefined));
  }

  function startEdit(d: PlatformKnowledgeDoc) {
    setError("");
    setInfo("");
    setPiiWarning(null);
    setPiiConfirmed(false);
    setDuplicateNotice(null);
    setFileErrors([]);
    setQueue([]);
    setDraft({
      id: d.id,
      title: d.title,
      category: d.category,
      summary: d.summary ?? "",
      bodyText: d.bodyText ?? "",
      // 수정 진입 시점의 본문은 이미 사용자가 만진 결과로 보존되어야 하므로 dirty=true.
      bodyTextDirty: true,
      fileUrl: d.fileUrl ?? "",
      fileName: d.fileName ?? "",
      fileHash: ((d as unknown as { fileHash?: string | null }).fileHash) ?? null,
      extractor: null,
      effectiveDate: d.effectiveDate ?? "",
      version: d.version ?? "",
      isActive: d.isActive,
      targetRoles: ((d as unknown as { targetRoles?: string[] | null }).targetRoles) ?? [],
    });
  }

  function refresh() {
    queryClient.invalidateQueries({ queryKey: getListPlatformKnowledgeDocsQueryKey() });
  }

  // [Task #533] 단일 파일에 대해 서명 URL 발급 → PUT 업로드 → finalize → 본문 추출.
  //   진행률 콜백을 받아 큐 UI 가 항목별 % 를 표시할 수 있게 한다.
  async function uploadAndExtract(
    file: File,
    onProgress: (pct: number) => void,
  ): Promise<{ objectPath: string; fileHash: string | null; bodyText: string; extractor: string }> {
    const sign = await fetch(`${API_BASE}/storage/uploads/request-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        contentType: file.type || "application/octet-stream",
      }),
    });
    if (!sign.ok) throw new Error("업로드 URL 발급 실패");
    const { uploadURL, objectPath } = await sign.json();

    // XHR 로 업로드 진행률을 노출. fetch 는 진행률 이벤트가 없다.
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadURL, true);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
      });
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`파일 업로드 실패 (HTTP ${xhr.status})`));
      });
      xhr.addEventListener("error", () => reject(new Error("파일 업로드 네트워크 오류")));
      xhr.send(file);
    });
    onProgress(100);

    const fin = await fetch(`${API_BASE}/storage/uploads/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ objectPath }),
    });
    if (!fin.ok) throw new Error("업로드 마무리 실패");

    // 본문 자동 추출 — 실패해도 200 으로 응답하므로 에러 처리는 extractor 값으로 분기.
    const ext = await fetch(`${API_BASE}/platform/knowledge-docs/extract-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ objectPath }),
    });
    if (!ext.ok) {
      // 권한/네트워크 문제로 추출 자체가 실패한 경우라도 업로드는 살리고 본문은 비운다.
      return { objectPath, fileHash: null, bodyText: "", extractor: "failed" };
    }
    const extData = (await ext.json()) as { bodyText?: string; fileHash?: string | null; extractor?: string };
    return {
      objectPath,
      fileHash: extData.fileHash ?? null,
      bodyText: extData.bodyText ?? "",
      extractor: extData.extractor ?? "failed",
    };
  }

  // [Task #533] 자료 수정 모드의 단일 파일 업로드. draft 에 결과를 주입한다.
  async function handleEditModeFile(file: File) {
    if (!draft) return;
    if (!ALLOWED_EXT_RE.test(file.name)) {
      setError(`허용되지 않은 확장자입니다: ${file.name}`);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(`파일이 너무 큽니다(200MB 초과): ${file.name}`);
      return;
    }
    setUploading(true);
    setError("");
    try {
      const { objectPath, fileHash, bodyText, extractor } = await uploadAndExtract(file, () => {});
      setDraft((cur) => {
        if (!cur) return cur;
        const next: DraftState = {
          ...cur,
          fileUrl: objectPath,
          fileName: file.name,
          fileHash,
          extractor: extractor as DraftState["extractor"],
        };
        // 사용자가 본문을 직접 손대지 않았고, 비어 있을 때만 자동 채움.
        if (!cur.bodyTextDirty && !cur.bodyText.trim() && bodyText) {
          next.bodyText = bodyText;
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 오류");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // [Task #533] 큐의 한 항목을 끝까지 처리: upload → extract → 자료 생성.
  //   단일 항목 안에서 "중복" 응답이 떨어지면 status=duplicate 로 멈추고
  //   사용자 결정(그래도 등록 / 건너뜀)을 기다린다.
  async function processQueueItem(itemId: string, opts?: { confirmDuplicate?: boolean }) {
    let target: QueueItem | undefined;
    setQueue((prev) => {
      target = prev.find((x) => x.id === itemId);
      return prev;
    });
    if (!target) return;

    // 1) 업로드 + 추출 (캐시되어 있으면 건너뜀).
    let cached = target.cached;
    if (!cached) {
      setQueue((prev) => prev.map((x) => x.id === itemId ? { ...x, status: "uploading", message: "업로드 중", progress: 0 } : x));
      try {
        const result = await uploadAndExtract(target.file, (pct) => {
          setQueue((prev) => prev.map((x) => x.id === itemId ? { ...x, progress: pct } : x));
        });
        cached = result;
        setQueue((prev) => prev.map((x) => x.id === itemId
          ? { ...x, status: "extracting", message: "본문 추출 완료", cached: result, progress: 100 }
          : x));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "업로드 실패";
        setQueue((prev) => prev.map((x) => x.id === itemId ? { ...x, status: "failed", message: msg } : x));
        return;
      }
    }

    // 2) 자료 생성 호출. 파일 이름에서 확장자를 떼어 기본 제목으로 사용.
    setQueue((prev) => prev.map((x) => x.id === itemId ? { ...x, status: "saving", message: "자료 등록 중" } : x));
    const baseTitle = target.file.name.replace(/\.[^.]+$/, "");
    const payload: Record<string, unknown> = {
      title: baseTitle.slice(0, 200),
      category: "법령",
      summary: null,
      bodyText: cached.bodyText,
      fileUrl: cached.objectPath,
      fileName: target.file.name,
      fileHash: cached.fileHash,
      effectiveDate: null,
      version: null,
      isActive: true,
      targetRoles: _roleFromUrl ? [_roleFromUrl] : null,
      // 큐 항목은 사용자가 본문을 본 적이 없으므로 PII/중복은 항상 명시 동의 대상.
      // 본문이 비어 있으면 PII 도 잡힐 일이 없다.
      confirmPii: false,
      confirmDuplicate: opts?.confirmDuplicate === true,
    };
    try {
      await create.mutateAsync({ data: payload as never });
      setQueue((prev) => prev.map((x) => x.id === itemId ? { ...x, status: "done", message: "등록 완료" } : x));
      refresh();
    } catch (e) {
      const ed = readErrorData(e);
      if (ed.status === 409 && ed.requiresConfirmation && ed.existing) {
        setQueue((prev) => prev.map((x) => x.id === itemId
          ? { ...x, status: "duplicate", message: `이미 등록됨: ${ed.existing!.title}`, duplicateOf: ed.existing }
          : x));
        return;
      }
      const msg = ed.error ?? (e instanceof Error ? e.message : "등록 실패");
      setQueue((prev) => prev.map((x) => x.id === itemId ? { ...x, status: "failed", message: msg } : x));
    }
  }

  // [Task #533] 큐 전체 순차 처리. 한 항목 실패해도 나머지는 계속 진행.
  async function runQueue(items: QueueItem[]) {
    for (const item of items) {
      // 사용자가 중복 결정으로 "건너뜀" 한 항목은 다시 돌리지 않는다.
      // 항상 최신 상태를 setQueue 콜백으로 읽어 와서 분기.
      let shouldRun = false;
      setQueue((prev) => {
        const cur = prev.find((x) => x.id === item.id);
        shouldRun = !!cur && (cur.status === "pending" || cur.status === "failed");
        return prev;
      });
      if (!shouldRun) continue;
      // eslint-disable-next-line no-await-in-loop
      await processQueueItem(item.id);
    }
  }

  // [Task #533] 드롭/파일선택 이벤트 공통 진입점.
  //   - 자료 수정 모드: 첫 파일만 사용 + 안내 메시지.
  //   - 새 자료 작성 모드:
  //     · 파일 1개: draft 에 직접 첨부 + 본문 자동 채움 (현재 draft 사용)
  //     · 파일 2개 이상: 큐 패널을 열고 각 파일을 별도 자료로 등록.
  function handleIncomingFiles(files: FileList | File[]) {
    if (!draft) return;
    const arr = Array.from(files);
    if (arr.length === 0) return;

    // 검증 — 잘못된 파일은 인라인 오류로 표시하고 통과한 파일만 처리한다.
    const valid: File[] = [];
    const errs: string[] = [];
    for (const f of arr) {
      if (!ALLOWED_EXT_RE.test(f.name)) {
        errs.push(`${f.name} — 허용되지 않은 확장자 (${ALLOWED_EXTS.join(", ")} 만 가능)`);
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        errs.push(`${f.name} — 파일 크기 200MB 초과`);
        continue;
      }
      valid.push(f);
    }
    setFileErrors(errs);
    if (valid.length === 0) return;

    // 자료 수정 모드: 단일 파일만 허용.
    if (draft.id !== null) {
      if (valid.length > 1) {
        setError("자료 수정 시에는 한 개의 파일만 첨부할 수 있습니다. 첫 번째 파일만 적용합니다.");
      }
      void handleEditModeFile(valid[0]);
      return;
    }

    // 새 자료 모드 — 단일 파일은 현재 draft 에 채움.
    if (valid.length === 1 && queue.length === 0) {
      void handleEditModeFile(valid[0]);
      return;
    }

    // 다중 파일: 큐 등록.
    const newItems: QueueItem[] = valid.map((file) => ({
      id: uniqueId(),
      file,
      status: "pending",
      progress: 0,
      message: "대기 중",
    }));
    setQueue((prev) => [...prev, ...newItems]);
    void runQueue(newItems);
  }

  function onDropZoneDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes("Files")) setDragActive(true);
  }
  function onDropZoneDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setDragActive(false);
  }
  function onDropZoneDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }
  function onDropZoneDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleIncomingFiles(e.dataTransfer.files);
    }
  }
  function onDropZoneKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  }

  async function save(opts?: { confirmDuplicate?: boolean }) {
    if (!draft) return;
    if (!draft.title.trim()) {
      setError("제목을 입력해 주세요");
      return;
    }
    if (!draft.bodyText.trim()) {
      setError("본문을 입력해 주세요. AI 비서는 본문 내용을 근거로 답변합니다.");
      return;
    }
    setError("");
    setInfo("");
    const payload: Record<string, unknown> = {
      title: draft.title.trim(),
      category: draft.category.trim() || "기타",
      summary: draft.summary.trim() || null,
      bodyText: draft.bodyText,
      fileUrl: draft.fileUrl || null,
      fileName: draft.fileName || null,
      fileHash: draft.fileHash || null,
      effectiveDate: draft.effectiveDate || null,
      version: draft.version || null,
      isActive: draft.isActive,
      targetRoles: draft.targetRoles.length > 0 ? draft.targetRoles : null,
      // 사용자가 PII 경고를 보고 명시적으로 "확인" 토글을 켰을 때만 우회.
      confirmPii: piiConfirmed,
      // 사용자가 중복 경고를 보고 "그래도 등록" 을 누른 경우만 true.
      confirmDuplicate: opts?.confirmDuplicate === true,
    };
    try {
      if (draft.id === null) {
        await create.mutateAsync({ data: payload as never });
        setInfo("자료가 등록되었습니다");
      } else {
        await update.mutateAsync({ id: draft.id, data: payload as never });
        setInfo("자료가 수정되었습니다");
      }
      setDraft(null);
      setPiiWarning(null);
      setPiiConfirmed(false);
      setDuplicateNotice(null);
      refresh();
    } catch (e) {
      const ed = readErrorData(e);
      // 서버에서 PII 패턴을 감지했을 경우 사용자에게 명시적 확인을 요구한다.
      if (ed.requiresConfirmation && ed.piiTypes && ed.piiTypes.length > 0) {
        setPiiWarning(ed.piiTypes);
        setPiiConfirmed(false);
        setError(ed.error ?? "본문에 개인정보로 보이는 패턴이 포함되어 있습니다");
        return;
      }
      // 같은 파일이 이미 등록되어 있을 때 — "그래도 등록" 결정을 받기 전에는 막는다.
      if (ed.status === 409 && ed.requiresConfirmation && ed.existing) {
        setDuplicateNotice(ed.existing);
        setError(ed.error ?? `이미 등록된 자료가 있습니다: ${ed.existing.title}`);
        return;
      }
      setError(ed.error ?? (e instanceof Error ? e.message : "저장 중 오류가 발생했습니다"));
    }
  }

  async function onDelete(d: PlatformKnowledgeDoc) {
    if (!confirm(`"${d.title}" 자료를 삭제하시겠습니까?`)) return;
    try {
      await remove.mutateAsync({ id: d.id });
      refresh();
      setInfo("자료가 삭제되었습니다");
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제 중 오류가 발생했습니다");
    }
  }

  function downloadHref(objectPath: string) {
    if (!objectPath) return "#";
    // 공통 자료 첨부는 private ACL 이므로 인증 필요 라우트(/storage/objects/...)로
    // 서빙되며, 다운로드 링크는 토큰을 쿼리스트링으로 전달한다.
    const trimmed = objectPath.replace(/^\/objects\//, "");
    const t = encodeURIComponent(token ?? "");
    return `${API_BASE}/storage/objects/${trimmed}?token=${t}`;
  }

  // [Task #283] AI 공통 자료실은 '전역 공통 리소스'로 명세가 확정되었다.
  //   - 모든 역할의 AI 비서가 동일한 자료를 참조한다 (역할별 분리 저장소가 아님).
  //   - 사이드바에서 ?role=… 으로 진입한 경우 어느 역할 메뉴에서 들어왔는지를
  //     배너로 명시해 사용자가 잘못된 컨텍스트로 오해하지 않게 한다.
  //   - 향후 역할별 자료가 필요해지면 targetRoles 컬럼을 추가하고 필터링한다.
  const ROLE_BADGE: Record<string, string> = {
    manager: ROLE_LABELS.manager,
    accountant: ROLE_LABELS.accountant,
    facility_staff: ROLE_LABELS.facility_staff,
    hq_executive: ROLE_LABELS.hq_executive,
    partner: ROLE_LABELS.partner,
  };
  const roleParam = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("role") ?? ""
    : "";
  const roleBadge = ROLE_BADGE[roleParam] ?? null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-slate-700" />
            <h1 className="text-xl font-semibold text-slate-900">AI 공통 자료실</h1>
            {roleBadge && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                {roleBadge} 컨텍스트
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            여기에 등록한 법령·개정안·운영 가이드는 모든 관리소장의 AI 비서가 공통 참고자료로 사용합니다.
            <br />
            <span className="text-[12px]">
              본문(텍스트)이 AI 답변 근거가 되며, 첨부 파일은 관리자 다운로드용 원본입니다.
            </span>
          </p>
          {roleBadge && (
            <div className="mt-2 p-2 rounded-md bg-amber-50 border border-amber-200 text-[12px] text-amber-800">
              이 자료실은 모든 역할이 공유하는 <b>전역 공통 리소스</b>입니다. 현재
              {" "}<b>{roleBadge}</b> 메뉴에서 진입하셨지만, 여기서 등록·수정하는 자료는
              모든 역할의 AI 비서에 동일하게 반영됩니다.
            </div>
          )}
        </div>
        <Button onClick={startNew} disabled={!!draft} data-testid="button-new-doc">
          <Plus className="w-4 h-4 mr-1" />새 자료
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm" data-testid="error-banner">{error}</div>
      )}
      {info && (
        <div className="p-3 rounded-lg bg-green-50 text-green-700 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          {info}
        </div>
      )}

      {draft && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {draft.id === null ? "새 자료 작성" : `자료 수정 #${draft.id}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <Label className="text-xs">제목 *</Label>
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="예) 집합건물법 시행령 일부 개정안"
                  maxLength={200}
                  data-testid="input-doc-title"
                />
              </div>
              <div>
                <Label className="text-xs">분류</Label>
                <Input
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  placeholder="법령 / 개정안 / 운영가이드 등"
                  list="kb-categories"
                  maxLength={60}
                />
                <datalist id="kb-categories">
                  {CATEGORY_PRESETS.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <Label className="text-xs">요약 (선택)</Label>
              <Input
                value={draft.summary}
                onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                placeholder="한 줄 요약 — AI 가 자료를 분류·인용할 때 참고합니다"
                maxLength={500}
              />
            </div>

            {/* [Task #533] 본문 자동 추출 결과 안내 배너. */}
            {draft.extractor && draft.extractor !== null && (
              draft.extractor === "txt" || draft.extractor === "pdf" || draft.extractor === "docx" ? (
                draft.bodyText.length > 0 ? (
                  <div className="p-2 rounded-md bg-emerald-50 border border-emerald-200 text-[12px] text-emerald-800" data-testid="extract-success-banner">
                    {draft.bodyText.length.toLocaleString()}자가 자동으로 입력되었습니다. 필요하면 다듬어 주세요.
                  </div>
                ) : null
              ) : (
                <div className="p-2 rounded-md bg-amber-50 border border-amber-300 text-[12px] text-amber-900 flex items-start gap-2" data-testid="extract-failed-banner">
                  <AlertCircle className="w-4 h-4 mt-[1px] shrink-0" />
                  <span>
                    {draft.extractor === "unsupported"
                      ? "이 형식(.hwp/.hwpx 등)은 본문이 자동 추출되지 않습니다. 본문을 직접 입력해 주세요."
                      : "본문이 자동 추출되지 않았습니다. 본문을 직접 입력해 주세요."}
                  </span>
                </div>
              )
            )}

            <div>
              <Label className="text-xs">본문 * (AI 가 답변 근거로 사용하는 텍스트)</Label>
              <Textarea
                value={draft.bodyText}
                onChange={(e) => setDraft({ ...draft, bodyText: e.target.value, bodyTextDirty: true })}
                placeholder={"법령 조문이나 개정안 본문, 가이드 텍스트를 그대로 붙여넣어 주세요.\n원문이 길 경우 핵심 조항만 요약·발췌해도 좋습니다.\n본문은 AI 답변 근거로 사용되므로 정확히 입력해 주세요."}
                rows={14}
                className="font-mono text-[13px] leading-relaxed"
                data-testid="textarea-doc-body"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                현재 길이: {draft.bodyText.length.toLocaleString()}자
                {draft.bodyText.length > 1500 && (
                  <span className="text-amber-600 ml-1">
                    · 자료 1건 당 1,500자, 전체 합계 8,000자까지만 AI 컨텍스트에 포함됩니다(나머지는 자동 생략).
                  </span>
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">시행일 (선택)</Label>
                <Input
                  type="date"
                  value={draft.effectiveDate}
                  onChange={(e) => setDraft({ ...draft, effectiveDate: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">버전 (선택)</Label>
                <Input
                  value={draft.version}
                  onChange={(e) => setDraft({ ...draft, version: e.target.value })}
                  placeholder="예) v2026-01"
                  maxLength={50}
                />
              </div>
            </div>

            {/* [Task #283] 노출 대상 역할(미선택 = 전체 공통). ?role=… 진입 시 기본 선택. */}
            <div>
              <Label className="text-xs">노출 대상 역할 (선택 안 하면 전체 공통)</Label>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {ROLE_OPTIONS.map((opt) => {
                  const checked = draft.targetRoles.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className={`text-xs px-2 py-1 rounded border cursor-pointer ${
                        checked ? "bg-primary text-primary-foreground border-primary" : "bg-white border-slate-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? draft.targetRoles.filter((r) => r !== opt.value)
                            : [...draft.targetRoles, opt.value];
                          setDraft({ ...draft, targetRoles: next });
                        }}
                      />
                      {opt.label}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* [Task #533] 드래그앤드롭 드롭존. 키보드 포커스/Enter/Space 도 지원. */}
            <div>
              <Label className="text-xs">참조 파일 (PDF/한글 등 — 선택)</Label>
              <div
                role="button"
                tabIndex={0}
                aria-label="파일을 드래그하거나 클릭해 업로드"
                data-testid="dropzone-knowledge-doc"
                onDragEnter={onDropZoneDragEnter}
                onDragLeave={onDropZoneDragLeave}
                onDragOver={onDropZoneDragOver}
                onDrop={onDropZoneDrop}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={onDropZoneKeyDown}
                className={[
                  "mt-1.5 rounded-lg p-6 text-center cursor-pointer transition-colors",
                  "border-2",
                  dragActive ? "border-blue-500 bg-blue-50 border-solid" : "border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100",
                  "focus:outline-none focus:ring-2 focus:ring-blue-500",
                ].join(" ")}
              >
                <Upload className="w-6 h-6 mx-auto text-slate-400" />
                <div className="text-sm text-slate-700 mt-2">
                  {uploading
                    ? "업로드 중..."
                    : draft.id !== null
                      ? "파일을 끌어다 놓거나 클릭해 첨부 (한 번에 1개)"
                      : "파일을 끌어다 놓거나 클릭해 첨부 (여러 개 가능)"}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  허용 형식: {ALLOWED_EXTS.join(", ")} · 최대 200MB
                  <br />
                  본문은 PDF/DOCX/TXT 에서 자동 추출됩니다 (HWP/HWPX 는 직접 입력).
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.hwp,.hwpx,.doc,.docx,.txt"
                multiple={draft.id === null}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleIncomingFiles(e.target.files);
                  }
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                data-testid="input-doc-file"
              />

              {/* [Task #533] 인라인 파일 검증 오류. */}
              {fileErrors.length > 0 && (
                <ul className="mt-2 text-[12px] text-red-700 list-disc list-inside space-y-0.5" data-testid="file-validation-errors">
                  {fileErrors.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              )}

              {/* 현재 첨부 표시 (단일 파일 모드). */}
              {draft.fileName && (
                <div className="flex items-center gap-2 text-xs text-slate-700 mt-2" data-testid="current-attachment">
                  <Paperclip className="w-3.5 h-3.5" />
                  <span className="truncate max-w-[280px]">{draft.fileName}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-red-600"
                    onClick={() => setDraft({ ...draft, fileUrl: "", fileName: "", fileHash: null, extractor: null })}
                  >
                    제거
                  </Button>
                </div>
              )}

              <p className="text-[11px] text-slate-500 mt-1">
                첨부 파일은 관리자가 원문을 다운로드해 확인하기 위한 참조본이며, AI 답변에는 사용되지 않습니다.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draft.isActive}
                onCheckedChange={(c) => setDraft({ ...draft, isActive: c === true })}
              />
              활성 (체크 해제 시 AI 비서 컨텍스트에서 제외됩니다)
            </label>

            {piiWarning && piiWarning.length > 0 && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm space-y-2">
                <div className="font-medium">
                  ⚠ 본문에서 다음 패턴이 감지되었습니다: {piiWarning.join(", ")}
                </div>
                <p className="text-xs">
                  공통 자료는 모든 관리소장의 AI 비서가 참고하므로 개인정보·금융정보가 포함되지 않도록 점검해 주세요.
                  의도적으로 포함하셔야 한다면 아래 항목에 동의 후 다시 저장해 주세요.
                </p>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={piiConfirmed}
                    onCheckedChange={(c) => setPiiConfirmed(c === true)}
                  />
                  <span className="text-xs">개인정보 포함 가능성을 확인했으며, 그대로 등록합니다</span>
                </label>
              </div>
            )}

            {/* [Task #533] 단일 자료 저장 시 중복 감지 — 사용자 동의 후 강제 저장. */}
            {duplicateNotice && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-sm space-y-2" data-testid="duplicate-notice">
                <div className="font-medium">
                  이미 동일한 파일이 등록되어 있습니다: <b>{duplicateNotice.title}</b>
                </div>
                <p className="text-xs">
                  같은 자료가 중복 등록될 수 있습니다. 그래도 등록하시겠습니까?
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-amber-400 text-amber-900"
                    onClick={() => void save({ confirmDuplicate: true })}
                    data-testid="button-confirm-duplicate"
                  >
                    그래도 등록
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => { setDuplicateNotice(null); setError(""); }}
                  >
                    취소
                  </Button>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t">
              <Button onClick={() => void save()} disabled={create.isPending || update.isPending} data-testid="button-save-doc">
                <Save className="w-4 h-4 mr-1" />
                저장
              </Button>
              <Button variant="outline" onClick={() => setDraft(null)}>
                <X className="w-4 h-4 mr-1" />
                취소
              </Button>
            </div>

            {/* [Task #533] 다중 파일 업로드 큐 패널. */}
            {queue.length > 0 && (
              <div className="border-t pt-4 space-y-2" data-testid="upload-queue-panel">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">일괄 업로드 큐 ({queue.length}건)</Label>
                  {queue.every((q) => q.status === "done" || q.status === "failed" || q.status === "duplicate") && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setQueue([])}>
                      목록 비우기
                    </Button>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {queue.map((q) => (
                    <li key={q.id} className="border rounded-md p-2 text-xs flex items-center gap-3" data-testid={`queue-item-${q.id}`}>
                      <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-slate-800">{q.file.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {q.status === "uploading" && `업로드 중 ${q.progress}%`}
                          {q.status === "extracting" && "본문 추출 중..."}
                          {q.status === "saving" && "자료 등록 중..."}
                          {q.status === "pending" && "대기 중"}
                          {q.status === "done" && "✓ 완료"}
                          {q.status === "failed" && `실패: ${q.message}`}
                          {q.status === "duplicate" && q.duplicateOf && `이미 등록된 자료: ${q.duplicateOf.title}`}
                        </div>
                        {(q.status === "uploading" || q.status === "extracting") && (
                          <div className="h-1 bg-slate-200 rounded mt-1 overflow-hidden">
                            <div className="h-full bg-blue-500 transition-all" style={{ width: `${q.progress}%` }} />
                          </div>
                        )}
                      </div>
                      {q.status === "duplicate" && (
                        <div className="flex gap-1 shrink-0">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => void processQueueItem(q.id, { confirmDuplicate: true })}
                            data-testid={`button-queue-confirm-${q.id}`}
                          >
                            그래도 등록
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => setQueue((prev) => prev.filter((x) => x.id !== q.id))}
                          >
                            건너뜀
                          </Button>
                        </div>
                      )}
                      {q.status === "done" && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-slate-500">
                  큐의 각 파일은 독립된 자료로 등록됩니다. 위쪽 폼은 사용하지 않아도 됩니다.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">등록된 공통 자료</CardTitle>
          <Input
            placeholder="제목·분류 검색"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8 max-w-[220px]"
          />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-slate-500 py-6 text-center">불러오는 중...</div>
          ) : sorted.length === 0 ? (
            <div className="text-sm text-slate-500 py-6 text-center">
              {filter ? "검색 결과가 없습니다" : "등록된 자료가 없습니다. 오른쪽 위 \"새 자료\" 버튼으로 추가하세요."}
            </div>
          ) : (
            <div className="divide-y">
              {sorted.map((d) => (
                <div key={d.id} className="py-3 flex items-start justify-between gap-3" data-testid={`doc-row-${d.id}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                      <span className="font-medium text-sm truncate">{d.title}</span>
                      <Badge variant="outline" className="text-[10px]">{d.category}</Badge>
                      {d.isActive ? (
                        <Badge className="bg-green-600 text-[10px]">활성</Badge>
                      ) : (
                        <Badge variant="outline" className="text-slate-500 text-[10px]">비활성</Badge>
                      )}
                      {d.version && (
                        <Badge variant="outline" className="text-[10px]">{d.version}</Badge>
                      )}
                    </div>
                    {d.summary && (
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{d.summary}</p>
                    )}
                    <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-x-2">
                      <span>본문 {(d.bodyText ?? "").length.toLocaleString()}자</span>
                      {d.effectiveDate && <span>· 시행 {d.effectiveDate}</span>}
                      <span>· 수정 {new Date(d.updatedAt).toLocaleDateString("ko-KR")}</span>
                      {d.createdByName && <span>· {d.createdByName}</span>}
                      {d.fileUrl && d.fileName && (
                        <a
                          href={downloadHref(d.fileUrl)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline inline-flex items-center gap-1"
                        >
                          <FileDown className="w-3 h-3" />
                          {d.fileName}
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(d)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(d)}
                      disabled={remove.isPending}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
