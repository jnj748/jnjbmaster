import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Plus, Pencil, Trash2, Save, X, CheckCircle2, Upload, Paperclip, FileDown, FileText } from "lucide-react";
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

// 플랫폼 전용 — 모든 관리소장 AI 비서가 공통으로 참조할
// 법령/개정안/운영 가이드 등을 등록·관리한다.
// AI 가 실제로 사용하는 것은 "본문(bodyText)" 이며, 첨부 파일은 사용자 다운로드용 참조본이다.

interface DraftState {
  id: number | null;
  title: string;
  category: string;
  summary: string;
  bodyText: string;
  fileUrl: string;
  fileName: string;
  effectiveDate: string;
  version: string;
  isActive: boolean;
  // [Task #283] 노출 대상 역할. 빈 배열이면 전체 공통.
  targetRoles: string[];
}

const CATEGORY_PRESETS = ["법령", "개정안", "운영가이드", "안전관리", "회계/세무", "기타"];

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "manager", label: "관리자" },
  { value: "accountant", label: "경리" },
  { value: "facility_staff", label: "시설직원" },
  { value: "partner", label: "파트너사" },
  { value: "hq_executive", label: "본사총괄" },
];

function emptyDraft(defaultRole?: string): DraftState {
  return {
    id: null,
    title: "",
    category: "법령",
    summary: "",
    bodyText: "",
    fileUrl: "",
    fileName: "",
    effectiveDate: "",
    version: "",
    isActive: true,
    targetRoles: defaultRole ? [defaultRole] : [],
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
    setDraft(emptyDraft(_roleFromUrl || undefined));
  }

  function startEdit(d: PlatformKnowledgeDoc) {
    setError("");
    setInfo("");
    setPiiWarning(null);
    setPiiConfirmed(false);
    setDraft({
      id: d.id,
      title: d.title,
      category: d.category,
      summary: d.summary ?? "",
      bodyText: d.bodyText ?? "",
      fileUrl: d.fileUrl ?? "",
      fileName: d.fileName ?? "",
      effectiveDate: d.effectiveDate ?? "",
      version: d.version ?? "",
      isActive: d.isActive,
      targetRoles: ((d as unknown as { targetRoles?: string[] | null }).targetRoles) ?? [],
    });
  }

  function refresh() {
    queryClient.invalidateQueries({ queryKey: getListPlatformKnowledgeDocsQueryKey() });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !draft) return;
    setUploading(true);
    setError("");
    try {
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
      const put = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error("파일 업로드 실패");
      const fin = await fetch(`${API_BASE}/storage/uploads/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ objectPath }),
      });
      if (!fin.ok) throw new Error("업로드 마무리 실패");
      setDraft({ ...draft, fileUrl: objectPath, fileName: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 오류");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function save() {
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
    const payload = {
      title: draft.title.trim(),
      category: draft.category.trim() || "기타",
      summary: draft.summary.trim() || null,
      bodyText: draft.bodyText,
      fileUrl: draft.fileUrl || null,
      fileName: draft.fileName || null,
      effectiveDate: draft.effectiveDate || null,
      version: draft.version || null,
      isActive: draft.isActive,
      targetRoles: draft.targetRoles.length > 0 ? draft.targetRoles : null,
      // 사용자가 PII 경고를 보고 명시적으로 "확인" 토글을 켰을 때만 우회.
      confirmPii: piiConfirmed,
    };
    try {
      if (draft.id === null) {
        await create.mutateAsync({ data: payload });
        setInfo("자료가 등록되었습니다");
      } else {
        await update.mutateAsync({ id: draft.id, data: payload });
        setInfo("자료가 수정되었습니다");
      }
      setDraft(null);
      setPiiWarning(null);
      setPiiConfirmed(false);
      refresh();
    } catch (e) {
      // 서버에서 PII 패턴을 감지했을 경우 사용자에게 명시적 확인을 요구한다.
      const anyErr = e as { response?: { data?: { piiTypes?: string[]; requiresConfirmation?: boolean; error?: string } }; message?: string };
      const data = anyErr?.response?.data;
      if (data?.requiresConfirmation && Array.isArray(data.piiTypes)) {
        setPiiWarning(data.piiTypes);
        setPiiConfirmed(false);
        setError(data.error ?? "본문에 개인정보로 보이는 패턴이 포함되어 있습니다");
        return;
      }
      setError(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다");
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
    manager: "관리소장",
    accountant: "경리·회계",
    facility_staff: "시설기사",
    hq_executive: "본사총괄",
    partner: "파트너사",
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
        <Button onClick={startNew} disabled={!!draft}>
          <Plus className="w-4 h-4 mr-1" />새 자료
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
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

            <div>
              <Label className="text-xs">본문 * (AI 가 답변 근거로 사용하는 텍스트)</Label>
              <Textarea
                value={draft.bodyText}
                onChange={(e) => setDraft({ ...draft, bodyText: e.target.value })}
                placeholder={"법령 조문이나 개정안 본문, 가이드 텍스트를 그대로 붙여넣어 주세요.\n원문이 길 경우 핵심 조항만 요약·발췌해도 좋습니다.\n본문은 AI 답변 근거로 사용되므로 정확히 입력해 주세요."}
                rows={14}
                className="font-mono text-[13px] leading-relaxed"
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

            <div>
              <Label className="text-xs">참조 파일 (PDF/한글 등 — 선택)</Label>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload className="w-4 h-4 mr-1" />
                  {uploading ? "업로드 중..." : "파일 선택"}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.hwp,.hwpx,.doc,.docx,.txt"
                  onChange={handleFileChange}
                />
                {draft.fileName ? (
                  <div className="flex items-center gap-2 text-xs text-slate-700">
                    <Paperclip className="w-3.5 h-3.5" />
                    <span className="truncate max-w-[280px]">{draft.fileName}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-red-600"
                      onClick={() => setDraft({ ...draft, fileUrl: "", fileName: "" })}
                    >
                      제거
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-slate-500">첨부 없음</span>
                )}
              </div>
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

            <div className="flex gap-2 pt-2 border-t">
              <Button onClick={save} disabled={create.isPending || update.isPending}>
                <Save className="w-4 h-4 mr-1" />
                저장
              </Button>
              <Button variant="outline" onClick={() => setDraft(null)}>
                <X className="w-4 h-4 mr-1" />
                취소
              </Button>
            </div>
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
                <div key={d.id} className="py-3 flex items-start justify-between gap-3">
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
