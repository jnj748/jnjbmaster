// [Task #758] 게스트 전자서명 화면 — 비로그인 외부 결재자(관리인/본부장 등)가
//   카톡/문자/이메일로 받은 일회용 링크를 통해 본인확인 → 문서 확인 → 서명/반려/보류.
//   모바일 우선 단일 페이지 흐름.

import { useEffect, useRef, useState, useCallback } from "react";
import { useRoute } from "wouter";

type Phase = "loading" | "expired" | "closed" | "needs_otp" | "needs_phone" | "verified" | "done" | "error";

type ApprovalMeta = {
  id: number;
  title: string;
  description: string | null;
  requesterName: string;
  createdAt: string;
};

type StepMeta = {
  id: number;
  stepOrder: number;
  approverRole: string;
  approverName: string | null;
};

type Attachment = { id: number; fileName: string; fileUrl: string; mimeType: string | null };
type PriorDecision = {
  stepOrder: number;
  approverName: string | null;
  status: string;
  decidedAt: string | null;
  comment: string | null;
};

type FetchResult = {
  status: string;
  needsOtp?: boolean;
  authMethod?: "sms_otp" | "phone_check";
  recipientName?: string;
  recipientPhoneMasked?: string;
  recipientRole?: string | null;
  expiresAt?: string;
  allowDownloadBeforeSign?: boolean;
  approval?: ApprovalMeta | null;
  step?: StepMeta | null;
  attachments?: Attachment[];
  priorDecisions?: PriorDecision[];
  sentByName?: string;
  action?: string | null;
  signedAt?: string | null;
  message?: string;
  error?: string;
};

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`;

export default function GuestSign() {
  const [, params] = useRoute<{ token: string }>("/guest-sign/:token");
  const token = params?.token ?? "";

  const [phase, setPhase] = useState<Phase>("loading");
  const [meta, setMeta] = useState<FetchResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [otpCode, setOtpCode] = useState("");
  const [otpDevHint, setOtpDevHint] = useState<string>("");
  const [otpRequesting, setOtpRequesting] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpRemaining, setOtpRemaining] = useState<number | null>(null);
  const [phoneLast4, setPhoneLast4] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [doneSummary, setDoneSummary] = useState<{ action: string; at: string } | null>(null);
  // 본인확인 후 발급되는 1회용 서명 세션 토큰. 페이지 새로고침 시 사라지므로
  // 사용자는 본인확인을 다시 거쳐야 한다.
  const [signToken, setSignToken] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const refreshMeta = useCallback(async () => {
    const res = await fetch(`${API_BASE}/public/guest-sign/${encodeURIComponent(token)}`);
    const data: FetchResult = await res.json();
    return { res, data };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const { res, data } = await refreshMeta();
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 410) {
            setPhase("expired");
            setErrorMsg(data.error ?? "사용할 수 없는 링크입니다.");
          } else {
            setPhase("error");
            setErrorMsg(data.error ?? "링크를 확인할 수 없습니다.");
          }
          setMeta(data);
          return;
        }
        setMeta(data);
        if (data.status === "signed" || data.status === "rejected") {
          setPhase("closed");
          setDoneSummary({ action: data.action ?? data.status, at: data.signedAt ?? "" });
          return;
        }
        // 메타가 verified 라도 클라이언트 메모리에 signToken 이 없으면 본인확인을
        // 다시 해야 한다. 새로고침/새 탭 진입 등에서 막다른길이 되지 않도록 강제로
        // OTP/phone-check 단계로 되돌린다.
        if (data.status === "verified" && data.authMethod === "phone_check") {
          setPhase("needs_phone");
          setErrorMsg("본인확인을 다시 진행해 주세요. (세션 보호)");
        } else if (data.status === "verified") {
          setPhase("needs_otp");
          setErrorMsg("본인확인을 다시 진행해 주세요. (세션 보호)");
        } else if (data.authMethod === "phone_check") {
          setPhase("needs_phone");
        } else {
          setPhase("needs_otp");
        }
      } catch {
        if (cancelled) return;
        setPhase("error");
        setErrorMsg("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, refreshMeta]);

  // ── OTP ──────────────────────────────────────────────────────────────
  const requestOtp = useCallback(async () => {
    setOtpRequesting(true);
    setOtpDevHint("");
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE}/public/guest-sign/${encodeURIComponent(token)}/request-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "인증번호 발송에 실패했습니다.");
        return;
      }
      if (data.devOtp) setOtpDevHint(`개발모드 인증번호: ${data.devOtp}`);
    } finally {
      setOtpRequesting(false);
    }
  }, [token]);

  const verifyOtp = useCallback(async () => {
    if (!/^\d{6}$/.test(otpCode)) {
      setErrorMsg("6자리 인증번호를 입력해 주세요.");
      return;
    }
    setOtpVerifying(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE}/public/guest-sign/${encodeURIComponent(token)}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: otpCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "인증에 실패했습니다.");
        if (typeof data.remaining === "number") setOtpRemaining(data.remaining);
        return;
      }
      setOtpCode("");
      if (typeof data.signToken === "string") setSignToken(data.signToken);
      // 검증 후 메타 다시 받아 첨부/이전결재 정보를 노출.
      const { data: refreshed } = await refreshMeta();
      setMeta(refreshed);
      setPhase("verified");
    } finally {
      setOtpVerifying(false);
    }
  }, [otpCode, token, refreshMeta]);

  const verifyPhone = useCallback(async () => {
    if (!/^\d{4}$/.test(phoneLast4)) {
      setErrorMsg("휴대폰 끝 4자리 숫자를 입력해 주세요.");
      return;
    }
    setOtpVerifying(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE}/public/guest-sign/${encodeURIComponent(token)}/verify-phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ last4: phoneLast4 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "확인에 실패했습니다.");
        if (typeof data.remaining === "number") setOtpRemaining(data.remaining);
        return;
      }
      setPhoneLast4("");
      if (typeof data.signToken === "string") setSignToken(data.signToken);
      const { data: refreshed } = await refreshMeta();
      setMeta(refreshed);
      setPhase("verified");
    } finally {
      setOtpVerifying(false);
    }
  }, [phoneLast4, token, refreshMeta]);

  // ── 서명 캔버스 ───────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "verified") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
  }, [phase]);

  function pointFromEvent(e: PointerEvent | React.PointerEvent): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPointRef.current = pointFromEvent(e);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current!.getContext("2d");
    if (!ctx) return;
    const p = pointFromEvent(e);
    const last = lastPointRef.current;
    if (last) {
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    lastPointRef.current = p;
    if (!hasSignature) setHasSignature(true);
  }
  function onPointerUp(e: React.PointerEvent) {
    drawingRef.current = false;
    lastPointRef.current = null;
    canvasRef.current?.releasePointerCapture(e.pointerId);
  }
  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasSignature(false);
  }

  // ── 제출 ─────────────────────────────────────────────────────────────
  async function submit(action: "approve" | "reject" | "hold") {
    setErrorMsg("");
    if ((action === "reject" || action === "hold") && !comment.trim()) {
      setErrorMsg(action === "reject" ? "반려 사유를 입력해 주세요." : "보류 사유를 입력해 주세요.");
      return;
    }
    let signatureImage: string | null = null;
    if (action === "approve") {
      if (!hasSignature) {
        setErrorMsg("서명을 입력해 주세요.");
        return;
      }
      signatureImage = canvasRef.current?.toDataURL("image/png") ?? null;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/public/guest-sign/${encodeURIComponent(token)}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, comment: comment.trim() || null, signatureImage, signToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "처리에 실패했습니다.");
        return;
      }
      setPhase("done");
      setDoneSummary({ action, at: new Date().toISOString() });
    } catch {
      setErrorMsg("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  const attachments = meta?.attachments ?? [];
  const priorDecisions = meta?.priorDecisions ?? [];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3">
          <h1 className="text-lg font-semibold text-slate-900">전자서명 요청</h1>
          <p className="text-xs text-slate-500">관리의달인 — 외부 결재자용 일회용 서명 페이지</p>
        </div>
      </header>

      <main className="flex-1 max-w-md w-full mx-auto px-4 py-4">
        {phase === "loading" && <div className="text-center text-slate-500 py-12">불러오는 중...</div>}

        {(phase === "expired" || phase === "error") && (
          <div className="bg-white rounded-xl border border-red-200 p-5 text-center">
            <div className="text-red-600 text-base font-medium mb-1">사용할 수 없는 링크</div>
            <p className="text-sm text-slate-600 whitespace-pre-line">
              {errorMsg || meta?.error || "링크가 만료되었거나 유효하지 않습니다."}
            </p>
            <p className="text-xs text-slate-400 mt-3">발신자에게 재발송을 요청해 주세요.</p>
          </div>
        )}

        {phase === "closed" && (
          <div className="bg-white rounded-xl border p-5 text-center">
            <div className="text-base font-medium mb-1">
              {doneSummary?.action === "approve" || doneSummary?.action === "signed"
                ? "이미 서명이 완료된 링크입니다"
                : "이미 반려된 링크입니다"}
            </div>
            <p className="text-xs text-slate-500">한 번 처리된 링크는 다시 사용할 수 없습니다.</p>
          </div>
        )}

        {(phase === "needs_otp" || phase === "needs_phone" || phase === "verified") && meta?.approval && (
          <section className="bg-white rounded-xl border p-4 mb-4">
            <p className="text-xs text-slate-500 mb-1">결재 요청</p>
            <h2 className="text-base font-semibold text-slate-900 mb-2">{meta.approval.title}</h2>
            {phase === "verified" && meta.approval.description && (
              <p className="text-sm text-slate-700 whitespace-pre-line mb-2">{meta.approval.description}</p>
            )}
            <dl className="text-xs text-slate-600 space-y-0.5">
              <div className="flex justify-between">
                <dt className="text-slate-400">상신자</dt>
                <dd>{meta.approval.requesterName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">상신일</dt>
                <dd>{new Date(meta.approval.createdAt).toLocaleDateString("ko-KR")}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">서명 요청자</dt>
                <dd>{meta.sentByName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">받는 분</dt>
                <dd>
                  {meta.recipientName} {meta.recipientRole ? `(${meta.recipientRole})` : ""}
                </dd>
              </div>
              {meta.step && (
                <div className="flex justify-between">
                  <dt className="text-slate-400">결재 단계</dt>
                  <dd>
                    {meta.step.stepOrder}단계 · {meta.step.approverRole}
                  </dd>
                </div>
              )}
              {meta.expiresAt && (
                <div className="flex justify-between">
                  <dt className="text-slate-400">유효기한</dt>
                  <dd>{new Date(meta.expiresAt).toLocaleString("ko-KR")}</dd>
                </div>
              )}
            </dl>
          </section>
        )}

        {phase === "verified" && priorDecisions.length > 0 && (
          <section className="bg-white rounded-xl border p-4 mb-4">
            <h3 className="text-sm font-semibold mb-2">이전 결재 단계</h3>
            <ul className="text-xs text-slate-700 space-y-1">
              {priorDecisions.map((d) => (
                <li key={d.stepOrder} className="flex justify-between gap-2">
                  <span className="text-slate-500">
                    {d.stepOrder}단계 {d.approverName ?? ""}
                  </span>
                  <span className={d.status === "approved" ? "text-emerald-700" : "text-red-700"}>
                    {d.status === "approved" ? "승인" : "반려"}
                    {d.decidedAt ? ` · ${new Date(d.decidedAt).toLocaleDateString("ko-KR")}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {phase === "verified" && attachments.length > 0 && (
          <section className="bg-white rounded-xl border p-4 mb-4">
            <h3 className="text-sm font-semibold mb-2">첨부 문서</h3>
            <ul className="text-xs space-y-1">
              {attachments.map((a) => (
                <li key={a.id}>
                  <a
                    href={a.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-700 underline break-all"
                    data-testid={`guest-sign-attachment-${a.id}`}
                  >
                    {a.fileName}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {phase === "needs_otp" && (
          <section className="bg-white rounded-xl border p-4">
            <h3 className="text-sm font-semibold mb-2">본인확인 (SMS 인증)</h3>
            <p className="text-xs text-slate-600 mb-3">
              {meta?.recipientPhoneMasked} 번호로 6자리 인증번호를 보내드립니다.
            </p>
            <button
              type="button"
              className="w-full h-10 rounded-md border border-slate-300 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
              disabled={otpRequesting}
              onClick={requestOtp}
              data-testid="guest-sign-request-otp"
            >
              {otpRequesting ? "전송 중..." : "인증번호 받기"}
            </button>
            {otpDevHint && (
              <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                {otpDevHint}
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <input
                inputMode="numeric"
                pattern="\d*"
                maxLength={6}
                placeholder="인증번호 6자리"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="flex-1 h-10 rounded-md border border-slate-300 px-3 text-base tracking-widest"
                data-testid="guest-sign-otp-input"
              />
              <button
                type="button"
                className="h-10 px-4 rounded-md bg-slate-900 text-white text-sm font-medium disabled:opacity-50"
                disabled={otpVerifying || otpCode.length !== 6}
                onClick={verifyOtp}
                data-testid="guest-sign-verify-otp"
              >
                {otpVerifying ? "확인 중..." : "확인"}
              </button>
            </div>
            {errorMsg && (
              <p className="mt-2 text-xs text-red-600" data-testid="guest-sign-error">
                {errorMsg}
                {otpRemaining !== null ? ` (남은 시도: ${otpRemaining}회)` : ""}
              </p>
            )}
          </section>
        )}

        {phase === "needs_phone" && (
          <section className="bg-white rounded-xl border p-4">
            <h3 className="text-sm font-semibold mb-2">본인확인 (휴대폰 끝 4자리)</h3>
            <p className="text-xs text-slate-600 mb-3">
              {meta?.recipientPhoneMasked} 번호의 끝 4자리를 입력해 주세요.
            </p>
            <div className="flex gap-2">
              <input
                inputMode="numeric"
                pattern="\d*"
                maxLength={4}
                placeholder="끝 4자리"
                value={phoneLast4}
                onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="flex-1 h-10 rounded-md border border-slate-300 px-3 text-base tracking-widest"
                data-testid="guest-sign-phone-input"
              />
              <button
                type="button"
                className="h-10 px-4 rounded-md bg-slate-900 text-white text-sm font-medium disabled:opacity-50"
                disabled={otpVerifying || phoneLast4.length !== 4}
                onClick={verifyPhone}
                data-testid="guest-sign-verify-phone"
              >
                {otpVerifying ? "확인 중..." : "확인"}
              </button>
            </div>
            {errorMsg && (
              <p className="mt-2 text-xs text-red-600" data-testid="guest-sign-error">
                {errorMsg}
                {otpRemaining !== null ? ` (남은 시도: ${otpRemaining}회)` : ""}
              </p>
            )}
          </section>
        )}

        {phase === "verified" && (
          <>
            <section className="bg-white rounded-xl border p-4 mb-4">
              <h3 className="text-sm font-semibold mb-2">전자서명</h3>
              <p className="text-xs text-slate-500 mb-2">아래 영역에 손가락 또는 마우스로 서명해 주세요.</p>
              <div className="border border-slate-300 rounded-md overflow-hidden bg-white">
                <canvas
                  ref={canvasRef}
                  className="w-full h-44 touch-none"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  data-testid="guest-sign-canvas"
                />
              </div>
              <button type="button" className="mt-2 text-xs text-slate-500 underline" onClick={clearSignature}>
                지우기
              </button>
            </section>
            <section className="bg-white rounded-xl border p-4 mb-4">
              <label className="text-xs text-slate-500 block mb-1">의견 / 사유 (반려·보류 시 필수)</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="필요 시 의견을 남겨주세요."
                data-testid="guest-sign-comment"
              />
            </section>
            {errorMsg && (
              <p className="mb-2 text-xs text-red-600" data-testid="guest-sign-error">
                {errorMsg}
              </p>
            )}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                className="col-span-3 h-12 rounded-md bg-emerald-600 text-white font-medium disabled:opacity-50"
                disabled={submitting}
                onClick={() => submit("approve")}
                data-testid="guest-sign-approve"
              >
                {submitting ? "처리 중..." : "승인 서명 제출"}
              </button>
              <button
                type="button"
                className="h-11 rounded-md border border-amber-300 text-amber-800 text-sm font-medium disabled:opacity-50"
                disabled={submitting}
                onClick={() => submit("hold")}
                data-testid="guest-sign-hold"
              >
                보류
              </button>
              <button
                type="button"
                className="col-span-2 h-11 rounded-md border border-red-300 text-red-700 text-sm font-medium disabled:opacity-50"
                disabled={submitting}
                onClick={() => submit("reject")}
                data-testid="guest-sign-reject"
              >
                반려
              </button>
            </div>
          </>
        )}

        {phase === "done" && (
          <div className="bg-white rounded-xl border border-emerald-200 p-5 text-center space-y-3">
            <div className="text-emerald-700 text-base font-semibold mb-1">
              {doneSummary?.action === "approve"
                ? "서명이 완료되었습니다"
                : doneSummary?.action === "hold"
                  ? "보류로 전달되었습니다"
                  : "반려 처리되었습니다"}
            </div>
            <p className="text-xs text-slate-500">감사합니다. 발신자에게 결과가 전달됩니다.</p>
            {doneSummary?.action === "approve" && signToken && (
              <a
                href={`${API_BASE}/public/guest-sign/${encodeURIComponent(token)}/signed-pdf?signToken=${encodeURIComponent(signToken)}`}
                className="inline-block w-full h-10 leading-10 rounded-md bg-slate-900 text-white text-sm font-medium"
                data-testid="guest-sign-download-pdf"
              >
                내 서명 PDF 다운로드
              </a>
            )}
            <p className="text-[11px] text-slate-400">
              이 페이지를 닫은 뒤에는 다시 접근할 수 없습니다. 필요 시 지금 PDF 를 저장해 두세요.
            </p>
          </div>
        )}
      </main>

      <footer className="text-center text-[11px] text-slate-400 py-4">
        보안: 일회용 링크 · 만료 후 사용 불가 · 본인확인 필수
      </footer>
    </div>
  );
}
