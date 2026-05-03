// [Task #758] 결재 단계 카드 안에 노출되는 "전자서명 링크 보내기" 패널.
//   - 발송 모달: 이름/휴대폰/채널/유효기간 입력 후 발급 → 원문 링크 1회 노출(복사).
//   - 목록: 발송된 링크 상태(active/viewed/verified/signed/rejected/expired/cancelled) 와
//     취소·재발송 버튼.

import { useEffect, useState, useCallback } from "react";

type GuestSigToken = {
  id: number;
  approvalId: number;
  stepId: number;
  recipientName: string;
  recipientPhone: string;
  recipientEmail: string | null;
  recipientRole: string | null;
  channel: "kakao" | "sms" | "email" | "link_copy";
  status: "active" | "viewed" | "verified" | "signed" | "rejected" | "expired" | "cancelled";
  expiresAt: string;
  sentAt: string;
  viewedAt: string | null;
  verifiedAt: string | null;
  signedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  action: string | null;
  comment: string | null;
  sentByName: string;
};

const STATUS_LABEL: Record<GuestSigToken["status"], string> = {
  active: "발송됨",
  viewed: "열람",
  verified: "본인확인 완료",
  signed: "서명완료",
  rejected: "반려",
  expired: "만료",
  cancelled: "취소됨",
};

const CHANNEL_LABEL: Record<GuestSigToken["channel"], string> = {
  link_copy: "링크 복사",
  sms: "문자",
  kakao: "카카오톡",
  email: "이메일",
};

interface Props {
  approvalId: number;
  stepId: number;
  approverName?: string;
  approverRole?: string;
  apiBase: string;
  token: string | null;
  disabled?: boolean;
}

export default function GuestSignaturePanel({
  approvalId,
  stepId,
  approverName,
  approverRole,
  apiBase,
  token,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<GuestSigToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [recipientName, setRecipientName] = useState(approverName ?? "");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientRole, setRecipientRole] = useState(approverRole ?? "");
  const [channel, setChannel] = useState<GuestSigToken["channel"]>("link_copy");
  const [expiryHours, setExpiryHours] = useState(72);
  // SMS OTP 가 권장(기본). phone_check 는 끝 4자리 매칭이라 보안 약함 — 안내문구로 표기.
  // 서버는 운영환경에서 GUEST_PHONE_CHECK_ENABLED=true 일 때만 phone_check 를 받는다.
  const [authMethod, setAuthMethod] = useState<"sms_otp" | "phone_check">("sms_otp");
  // 보안 기본값: 서명 전 첨부/문서 다운로드 비허용. 발신자가 명시적으로 토글했을 때만 허용.
  const [allowDownloadBeforeSign, setAllowDownloadBeforeSign] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [issuedLink, setIssuedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${apiBase}/approvals/${approvalId}/steps/${stepId}/guest-signatures`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json();
      if (Array.isArray(data)) setItems(data);
    } finally {
      setLoading(false);
    }
  }, [apiBase, approvalId, stepId, token]);

  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  async function handleSend() {
    setError("");
    setIssuedLink(null);
    if (!recipientName.trim() || !recipientPhone.trim()) {
      setError("이름과 휴대폰 번호를 입력해 주세요.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(
        `${apiBase}/approvals/${approvalId}/steps/${stepId}/guest-signatures`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            recipientName: recipientName.trim(),
            recipientPhone: recipientPhone.trim(),
            recipientEmail: recipientEmail.trim() || null,
            recipientRole: recipientRole.trim() || null,
            channel,
            expiryHours,
            authMethod,
            allowDownloadBeforeSign,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "발송에 실패했습니다.");
        return;
      }
      setIssuedLink(data.link as string);
      await reload();
    } finally {
      setSending(false);
    }
  }

  async function handleCancel(id: number) {
    if (!confirm("이 링크를 취소하시겠습니까?")) return;
    const res = await fetch(
      `${apiBase}/approvals/${approvalId}/steps/${stepId}/guest-signatures/${id}/cancel`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: "발신자 취소" }),
      },
    );
    if (res.ok) reload();
  }

  async function handleResend(id: number) {
    const res = await fetch(
      `${apiBase}/approvals/${approvalId}/steps/${stepId}/guest-signatures/${id}/resend`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      },
    );
    const data = await res.json();
    if (res.ok) {
      setIssuedLink(data.link as string);
      reload();
    }
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function closeModal() {
    setShowModal(false);
    setIssuedLink(null);
    setError("");
    setCopied(false);
  }

  const activeCount = items.filter(
    (i) => i.status === "active" || i.status === "viewed" || i.status === "verified",
  ).length;

  return (
    <div className="mt-2 ml-16">
      <button
        type="button"
        className="text-xs text-blue-700 underline disabled:text-slate-400"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        data-testid={`guest-sig-toggle-${stepId}`}
      >
        전자서명 링크{open ? " 접기" : " 보내기 / 진행상황"}
        {!open && activeCount > 0 ? ` (진행 ${activeCount})` : ""}
      </button>
      {open && (
        <div className="mt-2 p-2 rounded-md border bg-white space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              가입하지 않은 본부장/관리인에게 일회용 링크로 서명을 받습니다.
            </p>
            <button
              type="button"
              className="text-xs h-7 px-2 rounded bg-blue-600 text-white disabled:opacity-50"
              onClick={() => setShowModal(true)}
              disabled={disabled}
              data-testid={`guest-sig-new-${stepId}`}
            >
              + 새 링크 발송
            </button>
          </div>
          {loading ? (
            <p className="text-xs text-slate-400">불러오는 중...</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-slate-400">아직 발송된 링크가 없습니다.</p>
          ) : (
            <ul className="space-y-1">
              {items.map((it) => (
                <li
                  key={it.id}
                  className="text-xs border rounded px-2 py-1 flex items-center justify-between gap-2"
                  data-testid={`guest-sig-row-${it.id}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{it.recipientName}</span>
                      <span className="text-slate-400">{it.recipientPhone}</span>
                      <span className="text-[10px] text-slate-500">{CHANNEL_LABEL[it.channel]}</span>
                      <span
                        className={`text-[10px] px-1.5 rounded ${
                          it.status === "signed"
                            ? "bg-emerald-100 text-emerald-700"
                            : it.status === "rejected"
                            ? "bg-red-100 text-red-700"
                            : it.status === "expired" || it.status === "cancelled"
                            ? "bg-slate-200 text-slate-600"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {STATUS_LABEL[it.status]}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      만료: {new Date(it.expiresAt).toLocaleString("ko-KR")}
                      {it.viewedAt ? ` · 열람 ${new Date(it.viewedAt).toLocaleString("ko-KR")}` : ""}
                      {it.signedAt ? ` · 처리 ${new Date(it.signedAt).toLocaleString("ko-KR")}` : ""}
                    </div>
                    {it.comment && (
                      <div className="text-[10px] text-slate-600 mt-0.5">의견: {it.comment}</div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {(it.status === "active" || it.status === "viewed" || it.status === "verified") && (
                      <>
                        <button
                          type="button"
                          className="text-[10px] px-2 h-6 rounded border"
                          onClick={() => handleResend(it.id)}
                        >
                          재발송
                        </button>
                        <button
                          type="button"
                          className="text-[10px] px-2 h-6 rounded border text-red-600"
                          onClick={() => handleCancel(it.id)}
                        >
                          취소
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-3">
          <div className="bg-white w-full sm:max-w-md rounded-t-xl sm:rounded-xl p-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold">전자서명 링크 발송</h3>
              <button type="button" className="text-slate-500" onClick={closeModal}>
                ✕
              </button>
            </div>
            {issuedLink ? (
              <div className="space-y-3">
                <p className="text-sm text-emerald-700">
                  ✓ 링크가 발급되었습니다. 보안을 위해 이 화면에서만 1회 노출됩니다.
                </p>
                <div className="border rounded p-2 bg-slate-50 text-xs break-all">{issuedLink}</div>
                <button
                  type="button"
                  className="w-full h-10 rounded bg-blue-600 text-white text-sm font-medium"
                  onClick={() => copyLink(issuedLink)}
                  data-testid="guest-sig-copy-link"
                >
                  {copied ? "✓ 복사됨" : "링크 복사"}
                </button>
                <p className="text-[11px] text-slate-500">
                  카톡/문자/이메일에 붙여넣어 받는 분께 전달해 주세요. 한 번 처리되면 자동으로 만료됩니다.
                </p>
                <button
                  type="button"
                  className="w-full h-10 rounded border text-sm"
                  onClick={closeModal}
                >
                  닫기
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">받는 분 성함</label>
                  <input
                    className="w-full h-10 rounded border border-slate-300 px-2 text-sm"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    data-testid="guest-sig-name"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">휴대폰 번호</label>
                  <input
                    className="w-full h-10 rounded border border-slate-300 px-2 text-sm"
                    placeholder="010-0000-0000"
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    inputMode="tel"
                    data-testid="guest-sig-phone"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">이메일 (선택)</label>
                  <input
                    className="w-full h-10 rounded border border-slate-300 px-2 text-sm"
                    type="email"
                    placeholder="example@domain.com"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    inputMode="email"
                    data-testid="guest-sig-email"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    이메일 채널 사용 시 또는 결과 통지를 위한 보조 연락처로 사용됩니다.
                  </p>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">직책 (선택)</label>
                  <input
                    className="w-full h-10 rounded border border-slate-300 px-2 text-sm"
                    placeholder="관리인 / 본부장 등"
                    value={recipientRole}
                    onChange={(e) => setRecipientRole(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">발송 채널</label>
                  <select
                    className="w-full h-10 rounded border border-slate-300 px-2 text-sm bg-white"
                    value={channel}
                    onChange={(e) => setChannel(e.target.value as GuestSigToken["channel"])}
                    data-testid="guest-sig-channel"
                  >
                    <option value="link_copy">링크 복사 (직접 전달)</option>
                    <option value="sms">문자 (SMS)</option>
                    <option value="kakao">카카오 알림톡</option>
                    <option value="email">이메일</option>
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    현재 환경에서는 모든 채널이 발송 로그로 기록되며, 링크는 직접 복사해 전달하셔도 됩니다.
                  </p>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">본인확인 방식</label>
                  <select
                    className="w-full h-10 rounded border border-slate-300 px-2 text-sm bg-white"
                    value={authMethod}
                    onChange={(e) => setAuthMethod(e.target.value as "sms_otp" | "phone_check")}
                    data-testid="guest-sig-auth-method"
                  >
                    <option value="sms_otp">SMS 인증번호 (권장)</option>
                    <option value="phone_check">휴대폰 끝 4자리 (간이 · 보안약함)</option>
                  </select>
                  {authMethod === "phone_check" && (
                    <p className="text-[10px] text-amber-700 mt-1">
                      ⚠ 끝 4자리 매칭은 보안성이 약합니다. 운영환경에서는 관리자 설정이 필요할 수 있습니다.
                    </p>
                  )}
                </div>
                <div className="flex items-start gap-2">
                  <input
                    id="guest-sig-allow-download"
                    type="checkbox"
                    className="mt-1"
                    checked={allowDownloadBeforeSign}
                    onChange={(e) => setAllowDownloadBeforeSign(e.target.checked)}
                    data-testid="guest-sig-allow-download"
                  />
                  <label htmlFor="guest-sig-allow-download" className="text-xs text-slate-600">
                    서명 전 첨부 다운로드 허용 <span className="text-slate-400">(기본 비허용 · 권장)</span>
                  </label>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">유효 시간</label>
                  <select
                    className="w-full h-10 rounded border border-slate-300 px-2 text-sm bg-white"
                    value={expiryHours}
                    onChange={(e) => setExpiryHours(Number(e.target.value))}
                  >
                    <option value={24}>24시간</option>
                    <option value={48}>48시간</option>
                    <option value={72}>72시간 (기본)</option>
                    <option value={168}>7일</option>
                  </select>
                </div>
                {error && <p className="text-xs text-red-600">{error}</p>}
                <button
                  type="button"
                  className="w-full h-11 rounded bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
                  disabled={sending}
                  onClick={handleSend}
                  data-testid="guest-sig-submit"
                >
                  {sending ? "발송 중..." : "링크 발급 / 발송"}
                </button>
                <button
                  type="button"
                  className="w-full h-9 rounded border text-xs text-slate-600"
                  onClick={closeModal}
                >
                  취소
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
