// [Task #758] 관리인 가입 없이 SNS 링크로 전자서명 받기.
//
// 구성:
//   1) 공개(비인증) 라우트  — /public/guest-sign/:token/* — authMiddleware 앞에 마운트.
//      - GET  요청: 메타(만료/상태/제목/요청자/서명대상) 반환, viewedAt 기록.
//      - POST request-otp:  6자리 OTP 발급 + (개발모드) 로그.
//      - POST verify-otp:   OTP 검증, 단계 문서/메타 반환.
//      - POST sign:        승인/반려 + 서명이미지 + 코멘트. 단계 마감, signed_copies 적재.
//   2) 인증(매니저) 라우트 — /approvals/:id/steps/:stepId/guest-signatures
//      - POST: 발급(보내기), GET: 목록, POST :gid/cancel, POST :gid/resend.
//
// 토큰 모델:
//   - 발송용 원문 토큰(32B 랜덤, base64url) → sha256 해시만 DB 저장. 응답에는
//     원문 1회만 노출(매니저 모달에 "다시보기 불가"로 표시) + 채널별 발송.
//   - OTP 도 sha256 해시만 저장, 5분 만료, 5회 시도 제한.
//
// 채널:
//   - link_copy: 링크 문자열만 반환 (매니저가 수동으로 카톡/SMS 전송).
//   - sms / kakao / email: 현재는 dev-mode 로그 발송. 추후 외부 공급사 연동.

import { Router, type IRouter, type Request } from "express";
import { and, eq, desc } from "drizzle-orm";
import crypto from "crypto";
import {
  db,
  approvalsTable,
  approvalStepsTable,
  approvalSignedCopiesTable,
  approvalContractFilesTable,
  guestSignatureTokensTable,
  hqBuildingAssignmentsTable,
  usersTable,
} from "@workspace/db";
import { insertNotification } from "../lib/notificationRecipient";
import { saveProducingDocument } from "../repo/producingDocuments";
import PDFDocument from "pdfkit";

// phone_check 본인확인은 휴대폰 번호 끝 4자리 단순 매칭으로, 실제 통신사 본인인증
// 이 아니다. 운영 환경에서는 명시적 opt-in 환경변수 없이는 비활성화한다.
const PHONE_CHECK_ENABLED =
  process.env.NODE_ENV !== "production" || process.env.GUEST_PHONE_CHECK_ENABLED === "true";

// 승인 시 생성하는 서명 PDF — 단순 메타+서명 이미지를 한 페이지 PDF 로 합성.
async function buildSignedPdf(args: {
  approvalTitle: string;
  approvalId: number;
  stepOrder: number;
  approverRole: string;
  recipientName: string;
  recipientRole: string | null;
  signedAt: Date;
  comment: string | null;
  signatureDataUrl: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: args.approvalTitle } });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.fontSize(18).text("전자결재 서명서", { align: "center" });
      doc.moveDown();
      doc.fontSize(11);
      doc.text(`문서: ${args.approvalTitle}`);
      doc.text(`결재 ID: ${args.approvalId}  ·  단계: ${args.stepOrder} (${args.approverRole})`);
      doc.text(`서명자: ${args.recipientName}${args.recipientRole ? ` (${args.recipientRole})` : ""}`);
      doc.text(`서명 일시: ${args.signedAt.toISOString()}`);
      if (args.comment) {
        doc.moveDown();
        doc.text(`의견: ${args.comment}`);
      }
      doc.moveDown();
      doc.text("서명:");
      // data URL → Buffer
      const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(args.signatureDataUrl);
      if (m) {
        const buf = Buffer.from(m[2], "base64");
        try {
          doc.image(buf, { fit: [240, 120] });
        } catch {
          doc.text("(서명 이미지 첨부 실패)");
        }
      } else {
        doc.text("(서명 이미지 형식 오류)");
      }
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

// 권한 스코프 — approvalPipeline.ts 의 동등 함수와 같은 규칙.
async function accessibleBuildingScope(
  userId: number,
  role: string,
): Promise<{ allBuildings: boolean; ids: number[]; includeNullBuilding: boolean }> {
  if (role === "platform_admin") return { allBuildings: true, ids: [], includeNullBuilding: true };
  if (role === "hq_executive") {
    const assigned = await db
      .select({ buildingId: hqBuildingAssignmentsTable.buildingId })
      .from(hqBuildingAssignmentsTable)
      .where(eq(hqBuildingAssignmentsTable.hqUserId, userId));
    return { allBuildings: false, ids: assigned.map((r) => r.buildingId), includeNullBuilding: false };
  }
  const [u] = await db
    .select({ buildingId: usersTable.buildingId })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return {
    allBuildings: false,
    ids: u?.buildingId ? [u.buildingId] : [],
    includeNullBuilding: role === "manager",
  };
}

async function isApprovalAccessible(
  approval: typeof approvalsTable.$inferSelect,
  user: { userId: number; role: string },
): Promise<boolean> {
  if (approval.requesterId === user.userId) return true;
  if (user.role === "platform_admin") return true;
  if (user.role !== "manager" && user.role !== "accountant" && user.role !== "hq_executive") return false;
  const scope = await accessibleBuildingScope(user.userId, user.role);
  if (scope.allBuildings) return true;
  return approval.buildingId === null
    ? scope.includeNullBuilding
    : scope.ids.includes(approval.buildingId);
}

// ─── 공통 유틸 ─────────────────────────────────────────────────────────────
const TOKEN_BYTES = 32;
const DEFAULT_EXPIRY_HOURS = 72;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function generateToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

function generateOtp(): string {
  // 6자리 숫자, 앞자리 0 허용.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function clientIp(req: Request): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length > 0) return xf.split(",")[0].trim();
  return req.ip ?? "unknown";
}

function buildLink(req: Request, token: string): string {
  const proto = (req.headers["x-forwarded-proto"] as string) ?? req.protocol ?? "https";
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  return `${proto}://${host}/guest-sign/${token}`;
}

function publicSafeRow(r: typeof guestSignatureTokensTable.$inferSelect) {
  // 토큰 해시·OTP 해시 등 민감 필드 제외하고 매니저 UI 에 보여줄 메타.
  return {
    id: r.id,
    approvalId: r.approvalId,
    stepId: r.stepId,
    recipientName: r.recipientName,
    recipientPhone: r.recipientPhone,
    recipientEmail: r.recipientEmail,
    recipientRole: r.recipientRole,
    channel: r.channel,
    status: r.status,
    expiresAt: r.expiresAt.toISOString(),
    sentAt: r.sentAt.toISOString(),
    viewedAt: r.viewedAt?.toISOString() ?? null,
    verifiedAt: r.verifiedAt?.toISOString() ?? null,
    signedAt: r.signedAt?.toISOString() ?? null,
    cancelledAt: r.cancelledAt?.toISOString() ?? null,
    cancelReason: r.cancelReason,
    action: r.action,
    comment: r.comment,
    sentByName: r.sentByName,
    allowDownloadBeforeSign: r.allowDownloadBeforeSign,
  };
}

async function findActiveByToken(token: string) {
  const tokenHash = sha256(token);
  const [row] = await db
    .select()
    .from(guestSignatureTokensTable)
    .where(eq(guestSignatureTokensTable.tokenHash, tokenHash));
  return row ?? null;
}

function isLifecycleClosed(status: string): boolean {
  return status === "signed" || status === "rejected" || status === "expired" || status === "cancelled";
}

async function expireIfNeeded(row: typeof guestSignatureTokensTable.$inferSelect) {
  if (!isLifecycleClosed(row.status) && new Date() > row.expiresAt) {
    await db
      .update(guestSignatureTokensTable)
      .set({ status: "expired" })
      .where(eq(guestSignatureTokensTable.id, row.id));
    return { ...row, status: "expired" as const };
  }
  return row;
}

// ─── 공개(비인증) 라우터 ────────────────────────────────────────────────────
export const publicGuestSignaturesRouter: IRouter = Router();

publicGuestSignaturesRouter.get("/public/guest-sign/:token", async (req, res): Promise<void> => {
  const { token } = req.params;
  let row = await findActiveByToken(token);
  if (!row) {
    res.status(404).json({ error: "유효하지 않거나 만료된 링크입니다." });
    return;
  }
  row = await expireIfNeeded(row);
  if (row.status === "expired") {
    res.status(410).json({ error: "만료된 링크입니다. 발신자에게 재발송을 요청해 주세요.", status: row.status });
    return;
  }
  if (row.status === "cancelled") {
    res.status(410).json({ error: "취소된 링크입니다.", status: row.status });
    return;
  }
  if (row.status === "signed" || row.status === "rejected") {
    res.json({
      status: row.status,
      action: row.action,
      signedAt: row.signedAt?.toISOString() ?? null,
      message: row.status === "signed" ? "이미 서명이 완료된 링크입니다." : "이미 반려 처리된 링크입니다.",
    });
    return;
  }

  // 첫 열람 기록 + 상신자 알림(중복 방지).
  if (!row.viewedAt) {
    await db
      .update(guestSignatureTokensTable)
      .set({ viewedAt: new Date(), status: row.status === "active" ? "viewed" : row.status })
      .where(eq(guestSignatureTokensTable.id, row.id));
    if (!row.viewedNotifiedAt) {
      const [appr] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, row.approvalId));
      if (appr) {
        await insertNotification({
          recipientType: `user:${appr.requesterId}`,
          notificationType: "approval_guest_viewed",
          title: "전자서명 링크 열람",
          message: `${appr.title} — ${row.recipientName} 님이 서명 링크를 열람했습니다.`,
          relatedEntityType: "approval",
          relatedEntityId: appr.id,
        });
        await db
          .update(guestSignatureTokensTable)
          .set({ viewedNotifiedAt: new Date() })
          .where(eq(guestSignatureTokensTable.id, row.id));
      }
    }
  }

  const [approval] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, row.approvalId));
  const [step] = await db
    .select()
    .from(approvalStepsTable)
    .where(eq(approvalStepsTable.id, row.stepId));

  // 본인확인 후에만 첨부/이전단계 결재서를 노출 (열람 단계에서는 메타만).
  let attachments: Array<{ id: number; fileName: string; fileUrl: string; mimeType: string | null }> = [];
  let priorDecisions: Array<{
    stepOrder: number;
    approverName: string | null;
    status: string;
    decidedAt: string | null;
    comment: string | null;
  }> = [];
  if (row.verifiedAt) {
    if (row.allowDownloadBeforeSign) {
      const files = await db
        .select()
        .from(approvalContractFilesTable)
        .where(eq(approvalContractFilesTable.approvalId, row.approvalId));
      attachments = files.map((f) => ({
        id: f.id,
        fileName: f.fileName,
        fileUrl: f.fileUrl,
        mimeType: null,
      }));
    }
    const allSteps = await db
      .select()
      .from(approvalStepsTable)
      .where(eq(approvalStepsTable.approvalId, row.approvalId))
      .orderBy(approvalStepsTable.stepOrder);
    priorDecisions = allSteps
      .filter((s) => s.id !== row.stepId && (s.status === "approved" || s.status === "rejected"))
      .map((s) => ({
        stepOrder: s.stepOrder,
        approverName: s.approverName ?? null,
        status: s.status,
        decidedAt: s.decidedAt?.toISOString() ?? null,
        comment: s.comment ?? null,
      }));
  }

  // 본인확인 전에는 결재 본문/첨부/이전 결정사항을 절대 노출하지 않는다.
  // 식별 정보(제목/요청자명) 까지도 verifiedAt 이전에는 가린다.
  const verified = !!row.verifiedAt;
  res.json({
    status: verified ? "verified" : "viewed",
    needsOtp: !verified && row.authMethod === "sms_otp",
    authMethod: row.authMethod,
    recipientName: row.recipientName,
    recipientPhoneMasked: maskPhone(row.recipientPhone),
    recipientRole: row.recipientRole,
    expiresAt: row.expiresAt.toISOString(),
    allowDownloadBeforeSign: row.allowDownloadBeforeSign,
    approval: approval
      ? verified
        ? {
            id: approval.id,
            title: approval.title,
            description: approval.description ?? null,
            requesterName: approval.requesterName,
            createdAt: approval.createdAt.toISOString(),
          }
        : {
            // 본인확인 전: 본문/요청자명 비노출. 발송 일자만 안내.
            id: approval.id,
            title: null,
            description: null,
            requesterName: null,
            createdAt: approval.createdAt.toISOString(),
          }
      : null,
    step: step
      ? {
          id: step.id,
          stepOrder: step.stepOrder,
          approverRole: step.approverRole,
          approverName: verified ? step.approverName ?? null : null,
        }
      : null,
    attachments,
    priorDecisions,
    sentByName: verified ? row.sentByName : null,
  });
});

function maskPhone(phone: string): string {
  // 010-1234-5678 → 010-****-5678
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length < 7) return phone;
  const last4 = digits.slice(-4);
  return `${digits.slice(0, 3)}-****-${last4}`;
}

publicGuestSignaturesRouter.post("/public/guest-sign/:token/request-otp", async (req, res): Promise<void> => {
  const { token } = req.params;
  let row = await findActiveByToken(token);
  if (!row) {
    res.status(404).json({ error: "유효하지 않은 링크입니다." });
    return;
  }
  row = await expireIfNeeded(row);
  if (isLifecycleClosed(row.status)) {
    res.status(410).json({ error: "더 이상 사용할 수 없는 링크입니다.", status: row.status });
    return;
  }
  if (row.authMethod !== "sms_otp") {
    res.status(400).json({ error: "이 링크는 SMS 인증을 사용하지 않습니다." });
    return;
  }

  const otp = generateOtp();
  const otpHash = sha256(otp);
  const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
  await db
    .update(guestSignatureTokensTable)
    .set({ otpHash, otpExpiresAt, otpAttempts: 0 })
    .where(eq(guestSignatureTokensTable.id, row.id));

  // 실제 SMS 발송 — 추후 통신사 연동. 현재는 서버 로그로만 노출.
  req.log?.info?.(
    {
      kind: "guest_signature_otp_sent",
      tokenId: row.id,
      to: maskPhone(row.recipientPhone),
      // dev 모드에서 OTP 직접 노출(서버 로그). prod 에서도 카운팅용으로만 남겨도 좋음.
      otp: process.env.NODE_ENV === "production" ? undefined : otp,
    },
    `OTP 발송: ${maskPhone(row.recipientPhone)}`,
  );

  // 개발 환경에서는 응답에 OTP 를 포함해 수동 테스트 가능. 운영에서는 노출 금지.
  const devReveal = process.env.NODE_ENV !== "production";
  res.json({
    ok: true,
    expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
    devOtp: devReveal ? otp : undefined,
  });
});

publicGuestSignaturesRouter.post("/public/guest-sign/:token/verify-phone", async (req, res): Promise<void> => {
  // phone_check 모드: 본인 휴대폰 끝 4자리 입력으로 본인확인.
  const { token } = req.params;
  const last4 = String((req.body || {}).last4 || "").trim();
  if (!/^\d{4}$/.test(last4)) {
    res.status(400).json({ error: "휴대폰 끝 4자리 숫자를 입력해 주세요." });
    return;
  }
  let row = await findActiveByToken(token);
  if (!row) {
    res.status(404).json({ error: "유효하지 않은 링크입니다." });
    return;
  }
  row = await expireIfNeeded(row);
  if (isLifecycleClosed(row.status)) {
    res.status(410).json({ error: "더 이상 사용할 수 없는 링크입니다.", status: row.status });
    return;
  }
  if (row.authMethod !== "phone_check") {
    res.status(400).json({ error: "이 링크는 휴대폰 끝 4자리 확인 방식이 아닙니다." });
    return;
  }
  if (row.otpAttempts >= OTP_MAX_ATTEMPTS) {
    res.status(429).json({ error: "확인 시도 횟수를 초과했습니다." });
    return;
  }
  const expectedLast4 = row.recipientPhone.replace(/[^\d]/g, "").slice(-4);
  if (last4 !== expectedLast4) {
    await db
      .update(guestSignatureTokensTable)
      .set({ otpAttempts: row.otpAttempts + 1 })
      .where(eq(guestSignatureTokensTable.id, row.id));
    res.status(400).json({ error: "휴대폰 번호가 일치하지 않습니다.", remaining: OTP_MAX_ATTEMPTS - row.otpAttempts - 1 });
    return;
  }
  const signTokenPlain = generateToken();
  await db
    .update(guestSignatureTokensTable)
    .set({ verifiedAt: new Date(), status: "verified", signTokenHash: sha256(signTokenPlain) })
    .where(eq(guestSignatureTokensTable.id, row.id));
  res.json({ ok: true, status: "verified", signToken: signTokenPlain });
});

publicGuestSignaturesRouter.post("/public/guest-sign/:token/verify-otp", async (req, res): Promise<void> => {
  const { token } = req.params;
  const code = String((req.body || {}).code || "").trim();
  if (!/^\d{6}$/.test(code)) {
    res.status(400).json({ error: "6자리 숫자 인증번호를 입력해 주세요." });
    return;
  }
  let row = await findActiveByToken(token);
  if (!row) {
    res.status(404).json({ error: "유효하지 않은 링크입니다." });
    return;
  }
  row = await expireIfNeeded(row);
  if (isLifecycleClosed(row.status)) {
    res.status(410).json({ error: "더 이상 사용할 수 없는 링크입니다.", status: row.status });
    return;
  }
  if (row.authMethod !== "sms_otp") {
    res.status(400).json({ error: "이 링크는 SMS 인증을 사용하지 않습니다." });
    return;
  }
  if (!row.otpHash || !row.otpExpiresAt || new Date() > row.otpExpiresAt) {
    res.status(400).json({ error: "인증번호가 만료되었습니다. 재요청해 주세요." });
    return;
  }
  if (row.otpAttempts >= OTP_MAX_ATTEMPTS) {
    res.status(429).json({ error: "인증 시도 횟수를 초과했습니다. 인증번호를 재요청해 주세요." });
    return;
  }
  if (sha256(code) !== row.otpHash) {
    await db
      .update(guestSignatureTokensTable)
      .set({ otpAttempts: row.otpAttempts + 1 })
      .where(eq(guestSignatureTokensTable.id, row.id));
    res.status(400).json({ error: "인증번호가 일치하지 않습니다.", remaining: OTP_MAX_ATTEMPTS - row.otpAttempts - 1 });
    return;
  }

  const signTokenPlain = generateToken();
  await db
    .update(guestSignatureTokensTable)
    .set({
      verifiedAt: new Date(),
      status: "verified",
      otpHash: null,
      otpExpiresAt: null,
      signTokenHash: sha256(signTokenPlain),
    })
    .where(eq(guestSignatureTokensTable.id, row.id));

  res.json({ ok: true, status: "verified", signToken: signTokenPlain });
});

publicGuestSignaturesRouter.post("/public/guest-sign/:token/sign", async (req, res): Promise<void> => {
  const { token } = req.params;
  const body = req.body || {};
  const action = body.action as string;
  const comment = typeof body.comment === "string" ? body.comment : null;
  const signatureImage = typeof body.signatureImage === "string" ? body.signatureImage : null;
  const signTokenPlain = typeof body.signToken === "string" ? body.signToken : "";

  if (!["approve", "reject", "hold"].includes(action)) {
    res.status(400).json({ error: "처리 종류(approve/reject/hold)를 선택해 주세요." });
    return;
  }
  if (action === "approve" && !signatureImage) {
    res.status(400).json({ error: "승인 시 전자서명 이미지가 필요합니다." });
    return;
  }
  if (action === "reject" && !comment) {
    res.status(400).json({ error: "반려 시 사유를 입력해 주세요." });
    return;
  }
  if (action === "hold" && !comment) {
    res.status(400).json({ error: "보류 시 사유를 입력해 주세요." });
    return;
  }

  let row = await findActiveByToken(token);
  if (!row) {
    res.status(404).json({ error: "유효하지 않은 링크입니다." });
    return;
  }
  row = await expireIfNeeded(row);
  if (isLifecycleClosed(row.status)) {
    res.status(410).json({ error: "더 이상 사용할 수 없는 링크입니다.", status: row.status });
    return;
  }
  if (!row.verifiedAt) {
    res.status(403).json({ error: "본인확인이 필요합니다." });
    return;
  }
  if (!row.signTokenHash || !signTokenPlain || sha256(signTokenPlain) !== row.signTokenHash) {
    res.status(403).json({ error: "서명 세션이 만료되었습니다. 본인확인을 다시 진행해 주세요." });
    return;
  }

  const [approval] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, row.approvalId));
  const [step] = await db
    .select()
    .from(approvalStepsTable)
    .where(and(eq(approvalStepsTable.id, row.stepId), eq(approvalStepsTable.approvalId, row.approvalId)));
  if (!approval || !step) {
    res.status(404).json({ error: "결재 정보를 찾을 수 없습니다." });
    return;
  }
  if (step.status !== "pending" && step.status !== "awaiting_offline") {
    res.status(409).json({ error: "이미 처리된 결재 단계입니다." });
    return;
  }
  if (step.stepOrder !== approval.currentStep) {
    res.status(409).json({ error: "현재 결재 차례가 아닙니다." });
    return;
  }

  const now = new Date();

  // hold: 단계와 결재 라인은 그대로 두고, 토큰만 보류 처리하고 상신자에게 알림.
  if (action === "hold") {
    await db
      .update(guestSignatureTokensTable)
      .set({
        status: "viewed",
        action: "hold",
        comment,
        signerIp: clientIp(req),
        signerUserAgent: req.headers["user-agent"]?.slice(0, 500) ?? null,
      })
      .where(eq(guestSignatureTokensTable.id, row.id));
    await insertNotification({
      recipientType: `user:${approval.requesterId}`,
      notificationType: "approval_hold",
      title: "결재 보류 (게스트 전자서명)",
      message: `${approval.title} — ${row.recipientName} 님이 보류: ${comment}`,
      relatedEntityType: "approval",
      relatedEntityId: approval.id,
    });
    res.json({ ok: true, status: "held" });
    return;
  }

  const newStepStatus = action === "approve" ? "approved" : "rejected";

  // 1) 단계 상태 업데이트.
  await db
    .update(approvalStepsTable)
    .set({
      status: newStepStatus,
      comment,
      processedAt: now,
      decidedAt: now,
      signedCopyMissing: false,
    })
    .where(eq(approvalStepsTable.id, step.id));

  // 2) signed_copies 에 전자서명 결과 적재 (전자결재 산출물).
  //    fileUrl 은 게스트 토큰 ID 기반 재생성 엔드포인트로, 인증된 매니저/상신자가
  //    PDF 를 즉시 다운로드할 수 있다. 서명 이미지는 토큰 row 에 보관되므로
  //    별도 파일 스토리지가 없어도 재현 가능. 승인일 때만 PDF 산출.
  let signedCopyId: number | null = null;
  if (action === "approve") {
    const [signedCopy] = await db
      .insert(approvalSignedCopiesTable)
      .values({
        approvalId: approval.id,
        stepId: step.id,
        pageNumber: 1,
        fileName: `signed_step_${step.id}_${row.id}.pdf`,
        fileUrl: `/api/approvals/${approval.id}/steps/${step.id}/guest-signatures/${row.id}/pdf`,
        mimeType: "application/pdf",
        uploadMethod: "file_picker",
        kind: "electronic_pdf",
        uploadedBy: 0, // 외부 게스트
        uploadedByName: `${row.recipientName} (게스트 전자서명)`,
      })
      .returning();
    signedCopyId = signedCopy.id;
  }

  // 3) 게스트 토큰 마감.
  await db
    .update(guestSignatureTokensTable)
    .set({
      status: action === "approve" ? "signed" : "rejected",
      action: action as "approve" | "reject",
      comment,
      signatureImageUrl: signatureImage,
      signedAt: now,
      signerIp: clientIp(req),
      signerUserAgent: req.headers["user-agent"]?.slice(0, 500) ?? null,
      signedCopyId,
    })
    .where(eq(guestSignatureTokensTable.id, row.id));

  // 4) 결재 라인 lifecycle — 반려 / 다음단계 / 라인종결.
  if (action === "reject") {
    await saveProducingDocument({
      write: (exec) =>
        exec
          .update(approvalsTable)
          .set({ status: "rejected", rejectionReason: comment ?? "반려됨" })
          .where(eq(approvalsTable.id, approval.id))
          .returning()
          .then((r) => r[0]),
      document: {
        kind: "approval",
        sourceTable: "approvals",
        state: "rejected",
        title: (r) => r.title,
        authorId: (r) => r.requesterId,
        buildingId: (r) => r.buildingId,
        href: (r) => `/approvals/${r.id}`,
      },
    });
    await insertNotification({
      recipientType: `user:${approval.requesterId}`,
      notificationType: "approval_rejected",
      title: "결재 반려 (게스트 전자서명)",
      message: `${approval.title} — ${row.recipientName} 님이 반려: ${comment ?? "사유 없음"}`,
      relatedEntityType: "approval",
      relatedEntityId: approval.id,
    });
  } else {
    const allSteps = await db
      .select()
      .from(approvalStepsTable)
      .where(eq(approvalStepsTable.approvalId, approval.id))
      .orderBy(approvalStepsTable.stepOrder);
    const nextPending = allSteps.find((s) => s.status === "pending" && s.id !== step.id);
    if (nextPending) {
      await saveProducingDocument({
        write: (exec) =>
          exec
            .update(approvalsTable)
            .set({ currentStep: nextPending.stepOrder, status: "in_progress" })
            .where(eq(approvalsTable.id, approval.id))
            .returning()
            .then((r) => r[0]),
        document: {
          kind: "approval",
          sourceTable: "approvals",
          state: "active",
          title: (r) => r.title,
          authorId: (r) => r.requesterId,
          buildingId: (r) => r.buildingId,
          href: (r) => `/approvals/${r.id}`,
        },
      });
    } else {
      type ApprovalRow = typeof approvalsTable.$inferSelect;
      await saveProducingDocument<ApprovalRow>({
        write: (exec) =>
          exec
            .update(approvalsTable)
            .set({ status: "approved", approvedAt: now })
            .where(eq(approvalsTable.id, approval.id))
            .returning()
            .then((r) => r[0]),
        document: {
          kind: "approval",
          sourceTable: "approvals",
          state: "completed",
          title: (r) => r.title,
          authorId: (r) => r.requesterId,
          buildingId: (r) => r.buildingId,
          href: (r) => `/approvals/${r.id}`,
        },
      });
    }
    await insertNotification({
      recipientType: `user:${approval.requesterId}`,
      notificationType: "approval_step_approved",
      title: "결재 승인 (게스트 전자서명)",
      message: `${approval.title} — ${row.recipientName} 님이 승인 서명을 완료했습니다.`,
      relatedEntityType: "approval",
      relatedEntityId: approval.id,
    });
  }

  res.json({ ok: true, status: action === "approve" ? "signed" : "rejected" });
});

// 게스트 본인용 서명 PDF 다운로드 — 본인확인 완료 + signed 상태일 때만.
//   - URL 의 view 토큰 + signToken 동시 검증으로 임의 접근 차단.
//   - 발신자가 보낸 동일 링크에서 사용 가능하므로 별도의 메일 첨부 발송 없이도
//     서명 직후 화면에서 "내 서명 PDF 다운로드" 가 가능하다.
publicGuestSignaturesRouter.get(
  "/public/guest-sign/:token/signed-pdf",
  async (req, res): Promise<void> => {
    const { token } = req.params;
    const signTokenPlain = String((req.query.signToken as string) || "");
    let row = await findActiveByToken(token);
    if (!row) {
      res.status(404).json({ error: "유효하지 않은 링크입니다." });
      return;
    }
    if (row.status !== "signed" || row.action !== "approve" || !row.signatureImageUrl || !row.signedAt) {
      res.status(404).json({ error: "서명 PDF 가 없습니다." });
      return;
    }
    if (!row.signTokenHash || !signTokenPlain || sha256(signTokenPlain) !== row.signTokenHash) {
      res.status(403).json({ error: "서명 세션이 만료되었습니다." });
      return;
    }
    const [approval] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, row.approvalId));
    const [step] = await db.select().from(approvalStepsTable).where(eq(approvalStepsTable.id, row.stepId));
    if (!approval || !step) {
      res.status(404).json({ error: "결재 정보를 찾을 수 없습니다." });
      return;
    }
    const pdf = await buildSignedPdf({
      approvalTitle: approval.title,
      approvalId: approval.id,
      stepOrder: step.stepOrder,
      approverRole: step.approverRole,
      recipientName: row.recipientName,
      recipientRole: row.recipientRole,
      signedAt: row.signedAt,
      comment: row.comment,
      signatureDataUrl: row.signatureImageUrl,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="signed_${row.id}.pdf"`,
    );
    res.send(pdf);
  },
);

// ─── 매니저(인증) 라우터 ────────────────────────────────────────────────────
export const guestSignaturesRouter: IRouter = Router();

guestSignaturesRouter.post(
  "/approvals/:id/steps/:stepId/guest-signatures",
  async (req, res): Promise<void> => {
    const approvalId = Number(req.params.id);
    const stepId = Number(req.params.stepId);
    const user = req.user!;
    const body = req.body || {};

    const recipientName = String(body.recipientName || "").trim();
    const recipientPhone = String(body.recipientPhone || "").trim();
    const recipientEmail = body.recipientEmail ? String(body.recipientEmail).trim() : null;
    const recipientRole = body.recipientRole ? String(body.recipientRole).trim() : null;
    const channel = ["kakao", "sms", "email", "link_copy"].includes(body.channel) ? body.channel : "link_copy";
    const requestedAuthMethod = body.authMethod === "phone_check" ? "phone_check" : "sms_otp";
    if (requestedAuthMethod === "phone_check" && !PHONE_CHECK_ENABLED) {
      res.status(400).json({ error: "휴대폰 끝 4자리 확인 방식은 운영 환경에서 비활성화되어 있습니다. SMS 인증을 사용해 주세요." });
      return;
    }
    const authMethod = requestedAuthMethod;
    const expiryHours = Math.min(Math.max(Number(body.expiryHours) || DEFAULT_EXPIRY_HOURS, 1), 168);
    // 보안 기본값: 서명 전에는 첨부/문서 본문을 다운로드할 수 없다. 발신자가
    // 명시적으로 활성화한 경우에만 허용한다.
    const allowDownloadBeforeSign = body.allowDownloadBeforeSign === true;

    if (!recipientName || !recipientPhone) {
      res.status(400).json({ error: "받는 분 성함과 휴대폰 번호를 입력해 주세요." });
      return;
    }
    if (!/^[0-9\-\s+()]{9,20}$/.test(recipientPhone)) {
      res.status(400).json({ error: "휴대폰 번호 형식이 올바르지 않습니다." });
      return;
    }

    const [approval] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, approvalId));
    const [step] = await db
      .select()
      .from(approvalStepsTable)
      .where(and(eq(approvalStepsTable.id, stepId), eq(approvalStepsTable.approvalId, approvalId)));
    if (!approval || !step) {
      res.status(404).json({ error: "결재/단계를 찾을 수 없습니다." });
      return;
    }
    // 권한: 상신자 / platform_admin / 같은 건물 스코프.
    if (!(await isApprovalAccessible(approval, user))) {
      res.status(403).json({ error: "전자서명 링크를 발송할 권한이 없습니다." });
      return;
    }
    if (step.status !== "pending" && step.status !== "awaiting_offline") {
      res.status(400).json({ error: "이미 처리된 단계에는 링크를 보낼 수 없습니다." });
      return;
    }

    const senderName = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, user.userId))
      .then((rows) => rows[0]?.name ?? user.email ?? "발신자");

    const tokenPlain = generateToken();
    const tokenHash = sha256(tokenPlain);
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    const [created] = await db
      .insert(guestSignatureTokensTable)
      .values({
        approvalId,
        stepId,
        recipientName,
        recipientPhone,
        recipientEmail,
        recipientRole,
        channel,
        tokenHash,
        authMethod,
        status: "active",
        expiresAt,
        sentByUserId: user.userId,
        sentByName: senderName,
        allowDownloadBeforeSign,
      })
      .returning();

    // 단계 path 를 electronic 으로 자동 전환(아직 offline 이라면).
    if (step.path !== "electronic") {
      await db
        .update(approvalStepsTable)
        .set({ path: "electronic" })
        .where(eq(approvalStepsTable.id, step.id));
    }

    const link = buildLink(req, tokenPlain);

    // 채널별 발송 — 현재는 dev 로그. link_copy 는 매니저가 직접 전달.
    req.log?.info?.(
      {
        kind: "guest_signature_link_sent",
        channel,
        to: maskPhone(recipientPhone),
        approvalId,
        stepId,
        tokenId: created.id,
      },
      `게스트 전자서명 링크 발송 (${channel}) → ${recipientName} ${maskPhone(recipientPhone)}`,
    );

    res.status(201).json({
      token: publicSafeRow(created),
      // 원문 토큰/링크는 발급 직후 1회만 노출. 이후로는 매니저가 다시 보기 불가.
      link,
      message:
        channel === "link_copy"
          ? "링크를 복사해 카카오톡/문자로 직접 전달해 주세요."
          : "발송이 요청되었습니다. (현재 환경: 알림 로그)",
    });
  },
);

// 매니저 라우트 공용 — gid 가 path 의 approvalId/stepId 에 속하는지, 그리고
// 호출자가 발신자 본인(또는 platform_admin)인지 검증한다.
//   요구사항: "발신자가 보낸 링크만 자신이 보고/취소/재발송할 수 있다."
//   따라서 같은 건물 매니저라도 다른 사람이 보낸 링크는 건드릴 수 없다.
async function loadAndAuthorizeToken(
  req: Request,
): Promise<
  | { ok: true; token: typeof guestSignatureTokensTable.$inferSelect; approval: typeof approvalsTable.$inferSelect }
  | { ok: false; status: number; error: string }
> {
  const approvalId = Number(req.params.id);
  const stepId = Number(req.params.stepId);
  const gid = Number(req.params.gid);
  const user = req.user!;
  const [row] = await db
    .select()
    .from(guestSignatureTokensTable)
    .where(eq(guestSignatureTokensTable.id, gid));
  if (!row) return { ok: false, status: 404, error: "토큰을 찾을 수 없습니다." };
  if (row.approvalId !== approvalId || row.stepId !== stepId) {
    return { ok: false, status: 404, error: "토큰을 찾을 수 없습니다." };
  }
  const [approval] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, row.approvalId));
  if (!approval) return { ok: false, status: 404, error: "결재 정보를 찾을 수 없습니다." };
  // 발신자 본인 또는 platform_admin 만. 단순 같은-건물 매니저는 다른 발신자의
  // 토큰을 취소/재발송할 수 없다.
  const isSender = row.sentByUserId === user.userId;
  const isPlatformAdmin = user.role === "platform_admin";
  if (!isSender && !isPlatformAdmin) {
    return { ok: false, status: 403, error: "본인이 발송한 링크만 관리할 수 있습니다." };
  }
  // 추가: 결재 자체가 호출자 스코프에 있어야 한다 (안전망).
  if (!(await isApprovalAccessible(approval, user))) {
    return { ok: false, status: 403, error: "권한이 없습니다." };
  }
  return { ok: true, token: row, approval };
}

guestSignaturesRouter.get(
  "/approvals/:id/steps/:stepId/guest-signatures",
  async (req, res): Promise<void> => {
    const approvalId = Number(req.params.id);
    const stepId = Number(req.params.stepId);
    const user = req.user!;
    const [approval] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, approvalId));
    if (!approval) {
      res.status(404).json({ error: "결재 정보를 찾을 수 없습니다." });
      return;
    }
    if (!(await isApprovalAccessible(approval, user))) {
      res.status(403).json({ error: "권한이 없습니다." });
      return;
    }
    // 발신자가 보낸 토큰만 노출 (platform_admin 은 전체).
    const baseFilter =
      user.role === "platform_admin"
        ? and(
            eq(guestSignatureTokensTable.approvalId, approvalId),
            eq(guestSignatureTokensTable.stepId, stepId),
          )
        : and(
            eq(guestSignatureTokensTable.approvalId, approvalId),
            eq(guestSignatureTokensTable.stepId, stepId),
            eq(guestSignatureTokensTable.sentByUserId, user.userId),
          );
    const rows = await db
      .select()
      .from(guestSignatureTokensTable)
      .where(baseFilter)
      .orderBy(desc(guestSignatureTokensTable.id));
    // 만료 동기화.
    const synced = await Promise.all(rows.map(expireIfNeeded));
    res.json(synced.map(publicSafeRow));
  },
);

guestSignaturesRouter.post(
  "/approvals/:id/steps/:stepId/guest-signatures/:gid/cancel",
  async (req, res): Promise<void> => {
    const auth = await loadAndAuthorizeToken(req);
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }
    const reason = String((req.body || {}).reason || "발신자 취소");
    if (isLifecycleClosed(auth.token.status)) {
      res.status(400).json({ error: "이미 종결된 토큰입니다.", status: auth.token.status });
      return;
    }
    await db
      .update(guestSignatureTokensTable)
      .set({ status: "cancelled", cancelledAt: new Date(), cancelReason: reason })
      .where(eq(guestSignatureTokensTable.id, auth.token.id));
    res.json({ ok: true });
  },
);

guestSignaturesRouter.post(
  "/approvals/:id/steps/:stepId/guest-signatures/:gid/resend",
  async (req, res): Promise<void> => {
    const approvalId = Number(req.params.id);
    const stepId = Number(req.params.stepId);
    const user = req.user!;
    const auth = await loadAndAuthorizeToken(req);
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }
    const old = auth.token;
    if (old.status === "signed" || old.status === "rejected") {
      res.status(400).json({ error: "이미 처리된 토큰은 재발송할 수 없습니다.", status: old.status });
      return;
    }
    // 기존 토큰을 cancelled 처리하고 새 토큰 발급.
    if (!isLifecycleClosed(old.status)) {
      await db
        .update(guestSignatureTokensTable)
        .set({ status: "cancelled", cancelledAt: new Date(), cancelReason: "재발송으로 대체" })
        .where(eq(guestSignatureTokensTable.id, old.id));
    }
    const tokenPlain = generateToken();
    const tokenHash = sha256(tokenPlain);
    const expiresAt = new Date(Date.now() + DEFAULT_EXPIRY_HOURS * 60 * 60 * 1000);
    const senderName = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, user.userId))
      .then((rows) => rows[0]?.name ?? user.email ?? "발신자");
    const [created] = await db
      .insert(guestSignatureTokensTable)
      .values({
        approvalId,
        stepId,
        recipientName: old.recipientName,
        recipientPhone: old.recipientPhone,
        recipientEmail: old.recipientEmail,
        recipientRole: old.recipientRole,
        channel: old.channel,
        tokenHash,
        authMethod: old.authMethod,
        status: "active",
        expiresAt,
        sentByUserId: user.userId,
        sentByName: senderName,
        allowDownloadBeforeSign: old.allowDownloadBeforeSign,
      })
      .returning();
    const link = buildLink(req, tokenPlain);
    res.status(201).json({ token: publicSafeRow(created), link });
  },
);

// 서명 PDF 다운로드 — 인증된 매니저/상신자가 signed_copies.fileUrl 을 통해 접근.
guestSignaturesRouter.get(
  "/approvals/:id/steps/:stepId/guest-signatures/:gid/pdf",
  async (req, res): Promise<void> => {
    const approvalId = Number(req.params.id);
    const stepId = Number(req.params.stepId);
    const gid = Number(req.params.gid);
    const user = req.user!;
    const [row] = await db
      .select()
      .from(guestSignatureTokensTable)
      .where(eq(guestSignatureTokensTable.id, gid));
    if (!row || row.approvalId !== approvalId || row.stepId !== stepId) {
      res.status(404).json({ error: "토큰을 찾을 수 없습니다." });
      return;
    }
    const [approval] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, row.approvalId));
    if (!approval) {
      res.status(404).json({ error: "결재 정보를 찾을 수 없습니다." });
      return;
    }
    // 다운로드는 결재 접근 권한이 있는 사람 모두 (상신자/결재선/같은 건물 매니저).
    if (!(await isApprovalAccessible(approval, user))) {
      res.status(403).json({ error: "권한이 없습니다." });
      return;
    }
    if (row.action !== "approve" || !row.signatureImageUrl || !row.signedAt) {
      res.status(404).json({ error: "서명 PDF 가 없습니다." });
      return;
    }
    const [step] = await db.select().from(approvalStepsTable).where(eq(approvalStepsTable.id, stepId));
    const pdf = await buildSignedPdf({
      approvalTitle: approval.title,
      approvalId: approval.id,
      stepOrder: step?.stepOrder ?? 0,
      approverRole: step?.approverRole ?? "",
      recipientName: row.recipientName,
      recipientRole: row.recipientRole,
      signedAt: row.signedAt,
      comment: row.comment,
      signatureDataUrl: row.signatureImageUrl,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="signed_step_${stepId}_${gid}.pdf"`,
    );
    res.send(pdf);
  },
);

export default guestSignaturesRouter;
