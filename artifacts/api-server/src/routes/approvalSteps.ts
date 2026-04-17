import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, approvalsTable, approvalStepsTable, approvalRecipientsTable, digitalSignaturesTable, usersTable, notificationsTable, contractsTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import { transitionContractStatus } from "./contracts";

const router: IRouter = Router();
router.use(requireRole("manager", "platform_admin", "accountant"));

function serializeStep(r: typeof approvalStepsTable.$inferSelect) {
  return {
    ...r,
    processedAt: r.processedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

function serializeApproval(r: typeof approvalsTable.$inferSelect) {
  return {
    ...r,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

router.get("/approvals/:id/steps", async (req, res): Promise<void> => {
  const approvalId = Number(req.params.id);
  const user = req.user!;

  const [approval] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, approvalId));
  if (!approval) {
    res.status(404).json({ error: "결재 요청을 찾을 수 없습니다" });
    return;
  }

  if (user.role !== "manager" && user.role !== "platform_admin") {
    const isRequester = approval.requesterId === user.userId;
    const assignedSteps = await db.select({ id: approvalStepsTable.id })
      .from(approvalStepsTable)
      .where(and(eq(approvalStepsTable.approvalId, approvalId), eq(approvalStepsTable.approverId, user.userId)));
    if (!isRequester && assignedSteps.length === 0) {
      res.status(403).json({ error: "접근 권한이 없습니다" });
      return;
    }
  }

  const steps = await db
    .select()
    .from(approvalStepsTable)
    .where(eq(approvalStepsTable.approvalId, approvalId))
    .orderBy(approvalStepsTable.stepOrder);

  res.json(steps.map(serializeStep));
});

router.post("/approvals/:id/steps/:stepId/process", async (req, res): Promise<void> => {
  const approvalId = Number(req.params.id);
  const stepId = Number(req.params.stepId);
  const { action, comment, signatureId } = req.body;
  const user = req.user!;

  if (!action || !["approve", "reject"].includes(action)) {
    res.status(400).json({ error: "유효한 action(approve/reject)을 입력해주세요" });
    return;
  }

  const [approval] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, approvalId));
  if (!approval) {
    res.status(404).json({ error: "결재 요청을 찾을 수 없습니다" });
    return;
  }

  if (approval.isDraft || approval.status === "draft") {
    res.status(400).json({ error: "임시 저장 상태의 결재는 처리할 수 없습니다. 먼저 제출해주세요." });
    return;
  }

  if (approval.status === "approved" || approval.status === "rejected") {
    res.status(400).json({ error: "이미 최종 처리된 결재입니다" });
    return;
  }

  const [step] = await db
    .select()
    .from(approvalStepsTable)
    .where(and(eq(approvalStepsTable.id, stepId), eq(approvalStepsTable.approvalId, approvalId)));

  if (!step) {
    res.status(404).json({ error: "결재 단계를 찾을 수 없습니다" });
    return;
  }

  if (step.stepOrder !== approval.currentStep) {
    res.status(400).json({ error: "현재 결재 순서가 아닙니다. 이전 단계가 먼저 처리되어야 합니다" });
    return;
  }

  if (step.approverId !== user.userId) {
    res.status(403).json({ error: "이 단계의 결재 권한이 없습니다" });
    return;
  }

  if (step.status !== "pending") {
    res.status(400).json({ error: "이미 처리된 단계입니다" });
    return;
  }

  if (signatureId) {
    const [sig] = await db
      .select()
      .from(digitalSignaturesTable)
      .where(and(
        eq(digitalSignaturesTable.id, signatureId),
        eq(digitalSignaturesTable.userId, user.userId)
      ));
    if (!sig) {
      res.status(400).json({ error: "유효하지 않은 서명입니다. 본인의 서명만 사용할 수 있습니다" });
      return;
    }
  }

  const newStatus = action === "approve" ? "approved" : "rejected";

  const [updatedStep] = await db
    .update(approvalStepsTable)
    .set({
      status: newStatus,
      comment: comment ?? null,
      signatureId: signatureId ?? null,
      processedAt: new Date(),
    })
    .where(eq(approvalStepsTable.id, stepId))
    .returning();

  if (action === "reject") {
    await db
      .update(approvalsTable)
      .set({
        status: "rejected",
        rejectionReason: comment ?? "반려됨",
      })
      .where(eq(approvalsTable.id, approvalId));

    await db.insert(notificationsTable).values({
      recipientType: `user:${approval.requesterId}`,
      notificationType: "approval_rejected",
      title: "결재 반려",
      message: `결재가 반려되었습니다: ${comment || "사유 없음"}`,
      relatedEntityType: "approval",
      relatedEntityId: approvalId,
    });
  } else {
    const allSteps = await db
      .select()
      .from(approvalStepsTable)
      .where(eq(approvalStepsTable.approvalId, approvalId))
      .orderBy(approvalStepsTable.stepOrder);

    const nextStep = allSteps.find((s) => s.status === "pending" && s.id !== stepId);

    if (nextStep) {
      await db
        .update(approvalsTable)
        .set({
          currentStep: nextStep.stepOrder,
          status: "in_progress",
        })
        .where(eq(approvalsTable.id, approvalId));

      await db.insert(notificationsTable).values({
        recipientType: `user:${nextStep.approverId}`,
        notificationType: "approval_step_pending",
        title: "결재 대기",
        message: `결재 요청이 도착했습니다. 승인 또는 반려해주세요.`,
        relatedEntityType: "approval",
        relatedEntityId: approvalId,
      });
    } else {
      const userName = await db
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, user.userId))
        .then((rows) => rows[0]?.name ?? user.email);

      await db
        .update(approvalsTable)
        .set({
          status: "approved",
          approverId: user.userId,
          approverName: userName,
          approvedAt: new Date(),
        })
        .where(eq(approvalsTable.id, approvalId));

      const linkedContracts = await db
        .select()
        .from(contractsTable)
        .where(eq(contractsTable.approvalId, approvalId));
      for (const c of linkedContracts) {
        if (c.status === "in_approval" || c.status === "draft") {
          await transitionContractStatus(c.id, "active");
        }
      }

      await db.insert(notificationsTable).values({
        recipientType: `user:${approval.requesterId}`,
        notificationType: "approval_completed",
        title: "결재 완료",
        message: `결재가 최종 승인되었습니다.`,
        relatedEntityType: "approval",
        relatedEntityId: approvalId,
      });

      const recipients = await db
        .select()
        .from(approvalRecipientsTable)
        .where(eq(approvalRecipientsTable.approvalId, approvalId));

      for (const r of recipients) {
        await db.insert(notificationsTable).values({
          recipientType: `user:${r.userId}`,
          notificationType: "approval_shared",
          title: "결재 공유",
          message: `결재가 최종 승인되었습니다: ${approval.title}`,
          relatedEntityType: "approval",
          relatedEntityId: approvalId,
        });
      }
    }
  }

  res.json(serializeStep(updatedStep));
});

router.get("/approvals/:id/recipients", async (req, res): Promise<void> => {
  const approvalId = Number(req.params.id);
  const user = req.user!;

  const [approval] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, approvalId));
  if (!approval) {
    res.status(404).json({ error: "결재 요청을 찾을 수 없습니다" });
    return;
  }

  if (user.role !== "manager" && user.role !== "platform_admin") {
    const isRequester = approval.requesterId === user.userId;
    const assignedSteps = await db.select({ id: approvalStepsTable.id })
      .from(approvalStepsTable)
      .where(and(eq(approvalStepsTable.approvalId, approvalId), eq(approvalStepsTable.approverId, user.userId)));
    if (!isRequester && assignedSteps.length === 0) {
      res.status(403).json({ error: "접근 권한이 없습니다" });
      return;
    }
  }

  const recipients = await db
    .select()
    .from(approvalRecipientsTable)
    .where(eq(approvalRecipientsTable.approvalId, approvalId));

  res.json(
    recipients.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    }))
  );
});

router.post("/approvals/draft", async (req, res): Promise<void> => {
  const user = req.user!;
  const body = req.body;

  const userName = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, user.userId))
    .then((rows) => rows[0]?.name ?? user.email);

  const steps = body.approvalSteps || [];
  const recipients = body.recipients || [];

  if (steps.length > 5) {
    res.status(400).json({ error: "결재선은 최대 5단계까지 설정할 수 있습니다" });
    return;
  }

  const [row] = await db
    .insert(approvalsTable)
    .values({
      title: body.title || "임시 저장",
      description: body.description || "",
      category: body.category || "other",
      templateId: body.templateId ?? null,
      estimatedAmount: body.estimatedAmount ?? null,
      vendorName: body.vendorName ?? null,
      vendorQuoteDetails: body.vendorQuoteDetails ?? null,
      relatedDraftId: body.relatedDraftId ?? null,
      relatedInspectionId: body.relatedInspectionId ?? null,
      requesterId: user.userId,
      requesterName: userName,
      status: "draft",
      isDraft: true,
      totalSteps: steps.length || 1,
      currentStep: 1,
    })
    .returning();

  for (let i = 0; i < steps.length; i++) {
    await db.insert(approvalStepsTable).values({
      approvalId: row.id,
      stepOrder: i + 1,
      approverId: steps[i].approverId,
      approverName: steps[i].approverName,
      approverRole: steps[i].approverRole,
      status: "pending",
    });
  }

  for (const r of recipients) {
    await db.insert(approvalRecipientsTable).values({
      approvalId: row.id,
      userId: r.userId,
      userName: r.userName,
      type: r.type,
    });
  }

  res.status(201).json(serializeApproval(row));
});

router.put("/approvals/draft/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const body = req.body;
  const user = req.user!;

  const [existing] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, id));
  if (!existing || !existing.isDraft) {
    res.status(404).json({ error: "임시 저장 문서를 찾을 수 없습니다" });
    return;
  }

  if (existing.requesterId !== user.userId) {
    res.status(403).json({ error: "본인의 임시 저장 문서만 수정할 수 있습니다" });
    return;
  }

  const steps = body.approvalSteps || [];
  const recipients = body.recipients || [];

  if (steps.length > 5) {
    res.status(400).json({ error: "결재선은 최대 5단계까지 설정할 수 있습니다" });
    return;
  }

  const [row] = await db
    .update(approvalsTable)
    .set({
      title: body.title || existing.title,
      description: body.description || existing.description,
      category: body.category || existing.category,
      templateId: body.templateId ?? existing.templateId,
      estimatedAmount: body.estimatedAmount ?? existing.estimatedAmount,
      vendorName: body.vendorName ?? existing.vendorName,
      vendorQuoteDetails: body.vendorQuoteDetails ?? existing.vendorQuoteDetails,
      totalSteps: steps.length || existing.totalSteps,
    })
    .where(eq(approvalsTable.id, id))
    .returning();

  if (steps.length > 0) {
    await db.delete(approvalStepsTable).where(eq(approvalStepsTable.approvalId, id));
    for (let i = 0; i < steps.length; i++) {
      await db.insert(approvalStepsTable).values({
        approvalId: id,
        stepOrder: i + 1,
        approverId: steps[i].approverId,
        approverName: steps[i].approverName,
        approverRole: steps[i].approverRole,
        status: "pending",
      });
    }
  }

  if (recipients.length > 0) {
    await db.delete(approvalRecipientsTable).where(eq(approvalRecipientsTable.approvalId, id));
    for (const r of recipients) {
      await db.insert(approvalRecipientsTable).values({
        approvalId: id,
        userId: r.userId,
        userName: r.userName,
        type: r.type,
      });
    }
  }

  res.json(serializeApproval(row));
});

router.post("/approvals/draft/:id/submit", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const body = req.body || {};
  const user = req.user!;

  const [existing] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, id));
  if (!existing || !existing.isDraft) {
    res.status(404).json({ error: "임시 저장 문서를 찾을 수 없습니다" });
    return;
  }

  if (existing.requesterId !== user.userId) {
    res.status(403).json({ error: "본인의 임시 저장 문서만 제출할 수 있습니다" });
    return;
  }

  const steps = body.approvalSteps || [];
  const recipients = body.recipients || [];

  if (steps.length > 5) {
    res.status(400).json({ error: "결재선은 최대 5단계까지 설정할 수 있습니다" });
    return;
  }

  if (steps.length > 0) {
    await db.delete(approvalStepsTable).where(eq(approvalStepsTable.approvalId, id));
    for (let i = 0; i < steps.length; i++) {
      await db.insert(approvalStepsTable).values({
        approvalId: id,
        stepOrder: i + 1,
        approverId: steps[i].approverId,
        approverName: steps[i].approverName,
        approverRole: steps[i].approverRole,
        status: "pending",
      });
    }
  }

  if (recipients.length > 0) {
    await db.delete(approvalRecipientsTable).where(eq(approvalRecipientsTable.approvalId, id));
    for (const r of recipients) {
      await db.insert(approvalRecipientsTable).values({
        approvalId: id,
        userId: r.userId,
        userName: r.userName,
        type: r.type,
      });
    }
  }

  const allSteps = await db
    .select()
    .from(approvalStepsTable)
    .where(eq(approvalStepsTable.approvalId, id))
    .orderBy(approvalStepsTable.stepOrder);

  const updatedFields: Record<string, unknown> = {
    status: allSteps.length > 0 ? "in_progress" : "pending",
    isDraft: false,
    totalSteps: Math.max(allSteps.length, 1),
    currentStep: 1,
  };
  if (body.title) updatedFields.title = body.title;
  if (body.description) updatedFields.description = body.description;
  if (body.category) updatedFields.category = body.category;
  if (body.templateId !== undefined) updatedFields.templateId = body.templateId;
  if (body.estimatedAmount !== undefined) updatedFields.estimatedAmount = body.estimatedAmount;
  if (body.vendorName !== undefined) updatedFields.vendorName = body.vendorName;
  if (body.vendorQuoteDetails !== undefined) updatedFields.vendorQuoteDetails = body.vendorQuoteDetails;

  const [row] = await db
    .update(approvalsTable)
    .set(updatedFields)
    .where(eq(approvalsTable.id, id))
    .returning();

  if (allSteps.length > 0) {
    await db.insert(notificationsTable).values({
      recipientType: `user:${allSteps[0].approverId}`,
      notificationType: "approval_step_pending",
      title: "결재 요청",
      message: `결재 요청이 도착했습니다. 승인 또는 반려해주세요.`,
      relatedEntityType: "approval",
      relatedEntityId: id,
    });
  }

  res.json(serializeApproval(row));
});

export default router;
