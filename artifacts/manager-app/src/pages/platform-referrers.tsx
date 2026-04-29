import { useEffect, useState } from "react";
import { Search, Download, Gift, X, UserCheck, Phone, Calendar, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import {
  useListAdminReferrers,
  useGetAdminReferrerDetail,
  useCreateReferrerBenefit,
  getListAdminReferrersQueryKey,
  getGetAdminReferrerDetailQueryKey,
  CreateReferrerBenefitBodyKind,
  type ReferrerAggregateRow,
  type ReferralBenefit,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ROLE_LABELS } from "@workspace/shared/role-labels";
import { formatPhoneNumber } from "@/lib/format-korean";

// [Task #582] platform_admin 추천인 관리 대시보드.
//   - 좌측: 추천인 휴대폰 단위 집계 리스트 (검색·정렬·CSV).
//   - 우측: 선택된 추천인의 상세 패널 (가입자 목록 + 베네핏 이력 + "기록" 모달).
//   집계의 단위는 휴대폰 번호이며, 동일 번호의 회원이 존재하면 매칭 정보를 함께 노출.

type SortKey = "signups_desc" | "signups_asc" | "recent_desc" | "recent_asc" | "phone_asc";
const SORT_LABELS: Record<SortKey, string> = {
  signups_desc: "가입자 많은 순",
  signups_asc: "가입자 적은 순",
  recent_desc: "최근 가입 순",
  recent_asc: "오래된 가입 순",
  phone_asc: "번호 오름차순",
};

const KIND_LABELS: Record<string, string> = {
  credit: "크레딧",
  cash: "현금",
  other: "기타",
};

function roleLabelKr(role: string): string {
  return (ROLE_LABELS as Record<string, string>)[role] ?? role;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function downloadExportCsv(): Promise<{ ok: true } | { ok: false; error: string }> {
  const base = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/");
  const token = typeof window !== "undefined" ? window.localStorage.getItem("auth_token") : null;
  try {
    const res = await fetch(`${base}/admin/referrers/export`, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) {
      return { ok: false, error: res.status === 401 ? "권한이 없습니다" : "내려받기에 실패했습니다" };
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "referrers.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { ok: true };
  } catch {
    return { ok: false, error: "내려받기 중 오류가 발생했습니다" };
  }
}

export default function PlatformReferrersPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("signups_desc");
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [benefitOpen, setBenefitOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // 입력 디바운스 — 250ms.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.replace(/\D+/g, "")), 250);
    return () => clearTimeout(t);
  }, [search]);

  const listQuery = useListAdminReferrers({
    q: debouncedSearch || undefined,
    sort,
    limit: 200,
    offset: 0,
  });

  const referrers: ReferrerAggregateRow[] = listQuery.data?.referrers ?? [];
  const total = listQuery.data?.total ?? 0;

  async function handleExportCsv() {
    setExportError(null);
    setExporting(true);
    const result = await downloadExportCsv();
    setExporting(false);
    if (!result.ok) setExportError(result.error);
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-screen-2xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">추천인 관리</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            가입 시 입력된 추천인 휴대폰 번호를 기준으로 가입자 현황과 지급 베네핏을 관리합니다.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { void handleExportCsv(); }}
            disabled={exporting}
          >
            <Download className="w-4 h-4 mr-1" /> {exporting ? "내려받는 중..." : "CSV 내보내기"}
          </Button>
          {exportError ? (
            <span className="text-xs text-rose-600">{exportError}</span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4">
        {/* ── 좌측: 집계 리스트 ──────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Phone className="w-4 h-4" /> 추천인 목록
              <Badge variant="secondary" className="ml-auto text-xs">
                총 {total.toLocaleString("ko-KR")}건
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="휴대폰 번호 일부 검색 (숫자만)"
                  className="pl-8 h-9 text-sm"
                  inputMode="tel"
                />
              </div>
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger className="h-9 text-sm w-full sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                    <SelectItem key={k} value={k} className="text-sm">
                      {SORT_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {listQuery.isLoading ? (
              <div className="py-12 text-center text-sm text-slate-500">불러오는 중...</div>
            ) : referrers.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">
                등록된 추천인이 없습니다.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 -mx-2 max-h-[60vh] overflow-y-auto">
                {referrers.map((r) => {
                  const isActive = selectedPhone === r.referrerPhone;
                  return (
                    <li key={r.referrerPhone}>
                      <button
                        type="button"
                        onClick={() => setSelectedPhone(r.referrerPhone)}
                        className={`w-full text-left px-2 py-2.5 rounded-md transition-colors ${
                          isActive ? "bg-blue-50" : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-sm tabular-nums">
                            {formatPhoneNumber(r.referrerPhone)}
                          </div>
                          <Badge variant="outline" className="text-xs shrink-0">
                            가입 {r.signupCount}명
                          </Badge>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                          <span>
                            {r.matchedUser ? (
                              <span className="inline-flex items-center gap-1 text-slate-700">
                                <UserCheck className="w-3 h-3 text-emerald-600" />
                                {r.matchedUser.fullName} · {roleLabelKr(r.matchedUser.role)}
                              </span>
                            ) : (
                              <span className="text-slate-400">미가입 추천인</span>
                            )}
                          </span>
                          <span>최근 {formatDate(r.latestSignupAt)}</span>
                        </div>
                        {r.benefitCount > 0 ? (
                          <div className="mt-1 text-xs text-amber-700 flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1">
                              <Coins className="w-3 h-3" /> 베네핏 {r.benefitCount}건 ·{" "}
                              {r.benefitTotalAmount.toLocaleString("ko-KR")}
                            </span>
                            <span className="text-amber-700/80">
                              마지막 지급 {formatDate(r.latestBenefitAt)}
                            </span>
                          </div>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ── 우측: 상세 패널 ──────────────────────── */}
        <ReferrerDetailPanel
          phone={selectedPhone}
          onOpenBenefit={() => setBenefitOpen(true)}
        />
      </div>

      {selectedPhone ? (
        <BenefitGrantDialog
          phone={selectedPhone}
          open={benefitOpen}
          onOpenChange={setBenefitOpen}
        />
      ) : null}
    </div>
  );
}

// ── 상세 패널 ─────────────────────────────────────────────
function ReferrerDetailPanel({
  phone,
  onOpenBenefit,
}: {
  phone: string | null;
  onOpenBenefit: () => void;
}) {
  const detailQuery = useGetAdminReferrerDetail(phone ?? "", {
    query: { enabled: !!phone },
  });

  if (!phone) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-slate-500">
          좌측 목록에서 추천인을 선택하면 가입자/베네핏 이력이 여기에 표시됩니다.
        </CardContent>
      </Card>
    );
  }

  if (detailQuery.isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-slate-500">
          상세 정보를 불러오는 중...
        </CardContent>
      </Card>
    );
  }

  const detail = detailQuery.data;
  if (!detail) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-rose-600">
          상세 정보를 불러오지 못했습니다.
        </CardContent>
      </Card>
    );
  }

  const { matchedUser, recruitedUsers, benefits, benefitTotalAmount } = detail;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-semibold tabular-nums">
              {formatPhoneNumber(phone)}
            </CardTitle>
            <div className="mt-1 text-xs text-slate-500">
              {matchedUser ? (
                <span className="inline-flex items-center gap-1">
                  <UserCheck className="w-3 h-3 text-emerald-600" />
                  플랫폼 회원: {matchedUser.fullName} · {roleLabelKr(matchedUser.role)}
                </span>
              ) : (
                <span>이 번호의 플랫폼 회원은 아직 없습니다.</span>
              )}
            </div>
          </div>
          <Button size="sm" onClick={onOpenBenefit}>
            <Gift className="w-4 h-4 mr-1" /> 베네핏 기록
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* 가입자 목록 */}
        <section>
          <h3 className="text-xs font-semibold text-slate-700 mb-2">
            추천으로 가입한 회원 ({recruitedUsers.length}명)
          </h3>
          {recruitedUsers.length === 0 ? (
            <div className="text-xs text-slate-500 py-4">아직 가입자가 없습니다.</div>
          ) : (
            <div className="border border-slate-200 rounded-md divide-y divide-slate-100 max-h-64 overflow-y-auto">
              {recruitedUsers.map((u) => (
                <div key={u.id} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{u.fullName}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {roleLabelKr(u.role)} · {u.phone ? formatPhoneNumber(u.phone) : "연락처 없음"}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 shrink-0 inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {formatDate(u.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 베네핏 이력 */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-700">
              베네핏 이력 ({benefits.length}건)
            </h3>
            <span className="text-xs text-slate-500">
              합계 {benefitTotalAmount.toLocaleString("ko-KR")}
            </span>
          </div>
          {benefits.length === 0 ? (
            <div className="text-xs text-slate-500 py-4">기록된 베네핏이 없습니다.</div>
          ) : (
            <div className="border border-slate-200 rounded-md divide-y divide-slate-100 max-h-64 overflow-y-auto">
              {benefits.map((b: ReferralBenefit) => (
                <div key={b.id} className="px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="text-xs">
                      {KIND_LABELS[b.kind] ?? b.kind}
                    </Badge>
                    <span className="font-medium tabular-nums">
                      {b.amount.toLocaleString("ko-KR")}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500 flex items-center justify-between gap-2">
                    <span>
                      {b.grantedByName ?? `사용자 #${b.grantedByUserId}`}
                    </span>
                    <span>{formatDateTime(b.grantedAt)}</span>
                  </div>
                  {b.memo ? (
                    <div className="mt-1 text-xs text-slate-700 whitespace-pre-wrap">
                      {b.memo}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

// ── 베네핏 기록 모달 ───────────────────────────────────────
function BenefitGrantDialog({
  phone,
  open,
  onOpenChange,
}: {
  phone: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<keyof typeof CreateReferrerBenefitBodyKind>("credit");
  const [amountText, setAmountText] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useCreateReferrerBenefit({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetAdminReferrerDetailQueryKey(phone) });
        void queryClient.invalidateQueries({ queryKey: getListAdminReferrersQueryKey() });
        setKind("credit");
        setAmountText("");
        setMemo("");
        setError(null);
        onOpenChange(false);
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "기록에 실패했습니다";
        setError(msg);
      },
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amount = Number(amountText.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("금액은 1 이상의 숫자여야 합니다");
      return;
    }
    create.mutate({
      phone,
      data: {
        kind: CreateReferrerBenefitBodyKind[kind],
        amount: Math.floor(amount),
        memo: memo.trim() || null,
      },
    });
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="text-base flex items-center gap-2">
            <Gift className="w-4 h-4" /> 베네핏 기록 — {formatPhoneNumber(phone)}
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 px-1">
          <div>
            <Label className="text-xs">유형</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as keyof typeof CreateReferrerBenefitBodyKind)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="credit" className="text-sm">크레딧</SelectItem>
                <SelectItem value="cash" className="text-sm">현금</SelectItem>
                <SelectItem value="other" className="text-sm">기타</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">금액(원/크레딧)</Label>
            <Input
              type="text"
              inputMode="numeric"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value.replace(/[^\d,]/g, ""))}
              placeholder="예: 10000"
              className="h-9 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">메모 (선택)</Label>
            <Input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              maxLength={500}
              placeholder="지급 사유 등을 기록"
              className="h-9 text-sm"
            />
          </div>
          {error ? (
            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded px-2 py-1.5">
              {error}
            </div>
          ) : null}
          <ResponsiveDialogFooter className="!flex-row !justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              <X className="w-4 h-4 mr-1" /> 취소
            </Button>
            <Button type="submit" size="sm" disabled={create.isPending}>
              {create.isPending ? "기록 중..." : "기록 저장"}
            </Button>
          </ResponsiveDialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
