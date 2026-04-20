import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronDown, ChevronUp, Shield } from "lucide-react";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

export type ConsentRole = "manager" | "accountant" | "facility_staff" | "partner";

export interface ConsentDocument {
  id: number;
  role: ConsentRole;
  consentType: string;
  version: string;
  title: string;
  body: string;
  required: boolean;
}

export interface ConsentDecision {
  type: string;
  agreed: boolean;
  version: string;
}

interface Props {
  role: ConsentRole;
  value: Record<string, boolean>;
  onChange: (decisions: Record<string, boolean>) => void;
  // Used by the parent when validating before submit. The parent calls
  // shouldRePrompt() and shows the modal if it returns truthy.
  onDocsLoaded?: (docs: ConsentDocument[]) => void;
}

export function ConsentSection({ role, value, onChange, onDocsLoaded }: Props) {
  const [docs, setDocs] = useState<ConsentDocument[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${API_BASE}/platform/consent-documents/active?role=${role}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((data) => {
        if (cancelled) return;
        const list: ConsentDocument[] = Array.isArray(data?.documents) ? data.documents : [];
        // Sort: required first, then by a stable type order.
        const order = [
          "intermediary_terms",
          "privacy_policy",
          "partner_terms",
          "marketing",
          "third_party_sharing",
        ];
        list.sort((a, b) => {
          if (a.required !== b.required) return a.required ? -1 : 1;
          return order.indexOf(a.consentType) - order.indexOf(b.consentType);
        });
        setDocs(list);
        onDocsLoaded?.(list);
      })
      .catch(() => {
        if (!cancelled) setError("약관 목록을 불러오지 못했습니다");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const allChecked = docs.length > 0 && docs.every((d) => value[d.consentType]);

  function toggleAll(checked: boolean) {
    const next: Record<string, boolean> = { ...value };
    for (const d of docs) next[d.consentType] = checked;
    onChange(next);
  }

  function toggleOne(type: string, checked: boolean) {
    onChange({ ...value, [type]: checked });
  }

  function toggleExpand(type: string) {
    setExpanded({ ...expanded, [type]: !expanded[type] });
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        약관을 불러오는 중...
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
        {error}
      </div>
    );
  }
  if (docs.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        해당 역할에 등록된 약관이 없습니다.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-amber-600" />
          이용 약관 동의
        </span>
      </div>

      <label
        className={`flex items-center gap-2 text-xs font-semibold cursor-pointer rounded-md border px-2.5 py-2 ${
          allChecked ? "bg-blue-50 border-blue-300 text-blue-800" : "bg-white border-slate-300 text-slate-700"
        }`}
      >
        <input
          type="checkbox"
          checked={allChecked}
          onChange={(e) => toggleAll(e.target.checked)}
          aria-label="전체 동의"
        />
        <span>전체 동의</span>
      </label>

      <div className="space-y-1.5">
        {docs.map((d) => {
          const checked = !!value[d.consentType];
          const isExpanded = !!expanded[d.consentType];
          return (
            <div key={d.consentType} className="rounded-md border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={checked}
                    onChange={(e) => toggleOne(d.consentType, e.target.checked)}
                  />
                  <span>
                    <strong className={d.required ? "text-red-600" : "text-slate-500"}>
                      [{d.required ? "필수" : "선택"}]
                    </strong>{" "}
                    {d.title}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => toggleExpand(d.consentType)}
                  className="text-[11px] text-slate-500 hover:text-slate-700 inline-flex items-center gap-0.5 shrink-0"
                  aria-label={isExpanded ? "약관 접기" : "약관 펼치기"}
                >
                  {isExpanded ? "접기" : "본문"}
                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>
              {isExpanded && (
                <div className="max-h-40 overflow-y-auto border-t border-slate-200 px-2.5 py-2">
                  <pre className="text-[11px] whitespace-pre-wrap font-sans leading-4 text-slate-600">
                    {d.body}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface RePromptProps {
  open: boolean;
  onConfirm: () => void;
  onReject: () => void;
}

// [Task #133] Optional consents re-prompt dialog. "예" auto-checks and
// proceeds; "아니오" proceeds with declines preserved.
export function OptionalConsentRePromptDialog({ open, onConfirm, onReject }: RePromptProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onReject(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>선택 동의 안내</DialogTitle>
          <DialogDescription className="pt-2 text-sm leading-relaxed text-slate-700">
            선택정보 미동의시 핵심적인 AI 제공 정보 이용에 제약이 있을 수 있습니다.
            동의해주시겠습니까?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-row justify-end gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onReject}
            className="bg-slate-200 text-slate-700 hover:bg-slate-300 border-slate-300"
          >
            아니오
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            예
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function buildDecisions(
  docs: ConsentDocument[],
  value: Record<string, boolean>,
): ConsentDecision[] {
  return docs.map((d) => ({
    type: d.consentType,
    agreed: !!value[d.consentType],
    version: d.version,
  }));
}

export function getMissingRequired(
  docs: ConsentDocument[],
  value: Record<string, boolean>,
): ConsentDocument[] {
  return docs.filter((d) => d.required && !value[d.consentType]);
}

export function getMissingOptional(
  docs: ConsentDocument[],
  value: Record<string, boolean>,
): ConsentDocument[] {
  return docs.filter((d) => !d.required && !value[d.consentType]);
}

// Map a portal/role string into the consent role used by the documents API.
// For unified signup (no role yet), default to manager (it gets the same
// required set; partner_terms is partner-only).
export function resolveConsentRole(opts: {
  selectedRole?: string;
  portalType?: string;
}): ConsentRole {
  const r = opts.selectedRole;
  if (r === "manager" || r === "accountant" || r === "facility_staff" || r === "partner") return r;
  if (opts.portalType === "partner") return "partner";
  return "manager";
}

// Re-export utility hook for external consumers (memoized list of docs).
export function useConsentValue(initial: Record<string, boolean> = {}) {
  return useMemo(() => initial, [JSON.stringify(initial)]);
}
