import { Router, type IRouter, type Request, type Response } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  platformKnowledgeDocsTable,
  usersTable,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import { ObjectStorageService } from "../lib/objectStorage";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// 플랫폼 관리자가 관리하는 공통 지식 자료(법령/개정안/가이드 등) CRUD.
// 관리소장 AI 비서가 공통 컨텍스트로 참조한다.

// 본문 입력 검증:
//  - 최대 길이 10만 자(저장/메모리 폭주 방지). AI 컨텍스트는 별도로 8000자 캡 적용.
//  - fileUrl 은 반드시 내부 객체 스토리지 경로(/objects/...)만 허용해
//    외부 URL 주입을 차단한다.
const BODY_TEXT_MAX = 100_000;
const FILE_URL_RE = /^\/objects\/[^\s?#]+$/;

const CreateBody = z.object({
  title: z.string().min(1).max(200),
  category: z.string().min(1).max(60).default("기타"),
  summary: z.string().max(500).nullable().optional(),
  bodyText: z.string().max(BODY_TEXT_MAX).default(""),
  fileUrl: z.string().regex(FILE_URL_RE, "내부 업로드 경로만 허용됩니다").nullable().optional(),
  fileName: z.string().max(300).nullable().optional(),
  effectiveDate: z.string().nullable().optional(),
  version: z.string().max(50).nullable().optional(),
  isActive: z.boolean().optional(),
  // PII 감지 우회 확인 — 사용자가 "확인했습니다" 동의 후 재전송 시 true.
  confirmPii: z.boolean().optional(),
});

const UpdateBody = CreateBody.partial();

// PII 패턴 감지 — 본문에 명백한 개인정보·금융정보 패턴이 보이면
// 등록을 막고 사용자에게 명시적 확인을 요구한다.
//   - 주민등록번호: 6자리-7자리(7번째 자리 1~4)
//   - 한국 핸드폰: 010(또는 011/016/017/018/019)-XXXX-XXXX
//   - 신용카드 번호: 4-4-4-4 (구분자: 공백/하이픈/없음)
//   - 계좌번호 의심: "계좌"·"입금" 같은 단어 근처에 8자리 이상 숫자가 등장
const PII_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "주민등록번호", re: /\b\d{6}[-\s]?[1-4]\d{6}\b/ },
  { name: "휴대전화번호", re: /\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/ },
  { name: "카드번호", re: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/ },
  { name: "계좌번호 의심", re: /(계좌|입금|출금|예금주|이체)[\s\S]{0,40}?\b[\d-]{8,}\b/ },
];
function detectPii(text: string): string[] {
  if (!text) return [];
  const hits = new Set<string>();
  for (const { name, re } of PII_PATTERNS) {
    if (re.test(text)) hits.add(name);
  }
  return Array.from(hits);
}

// 첨부 파일을 비공개(private)로 강제하고 본 도큐먼트 작성자만 owner로 지정한다.
// 기본 finalize 가 visibility:"public" 으로 ACL 을 만들기 때문에, 공통 자료
// 첨부가 무인증 다운로드되지 않도록 작성/수정 시점에 한 번 더 덮어쓴다.
// ACL 설정 실패 시 fail-closed: 호출부가 저장을 중단/롤백하도록 throw 한다.
async function lockDownAttachment(objectPath: string | null | undefined, userId: number): Promise<void> {
  if (!objectPath) return;
  try {
    await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
      owner: String(userId),
      visibility: "private",
    });
  } catch (err) {
    logger.error({ err, objectPath }, "Failed to lock down platform knowledge attachment ACL");
    throw new Error("첨부 파일의 비공개 권한 설정에 실패했습니다");
  }
}

router.get(
  "/platform/knowledge-docs",
  requireRole("platform_admin", "hq_executive"),
  async (_req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(platformKnowledgeDocsTable)
      .orderBy(desc(platformKnowledgeDocsTable.createdAt));
    res.json(rows);
  },
);

router.post(
  "/platform/knowledge-docs",
  requireRole("platform_admin", "hq_executive"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const d = parsed.data;
    const piiHits = d.confirmPii ? [] : detectPii(d.bodyText ?? "");
    if (piiHits.length > 0) {
      res.status(400).json({
        error: "본문에 개인정보/금융정보로 보이는 패턴이 포함되어 있습니다",
        piiTypes: piiHits,
        requiresConfirmation: true,
      });
      return;
    }
    const [author] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId));
    // 첨부 ACL 을 먼저 비공개로 잠근다 — 실패 시 row 자체를 만들지 않아
    // "공개 상태인 첨부가 doc 에만 연결되는" fail-open 상태를 막는다.
    try {
      await lockDownAttachment(d.fileUrl ?? null, req.user!.userId);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "첨부 권한 설정 실패" });
      return;
    }
    const [created] = await db
      .insert(platformKnowledgeDocsTable)
      .values({
        title: d.title,
        category: d.category,
        summary: d.summary ?? null,
        bodyText: d.bodyText ?? "",
        fileUrl: d.fileUrl ?? null,
        fileName: d.fileName ?? null,
        effectiveDate: d.effectiveDate ?? null,
        version: d.version ?? null,
        isActive: d.isActive ?? true,
        createdBy: req.user!.userId,
        createdByName: author?.name ?? null,
      })
      .returning();
    res.status(201).json(created);
  },
);

router.patch(
  "/platform/knowledge-docs/:id",
  requireRole("platform_admin", "hq_executive"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "유효한 ID가 필요합니다" });
      return;
    }
    const parsed = UpdateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const d = parsed.data;
    if (d.bodyText !== undefined && !d.confirmPii) {
      const piiHits = detectPii(d.bodyText);
      if (piiHits.length > 0) {
        res.status(400).json({
          error: "본문에 개인정보/금융정보로 보이는 패턴이 포함되어 있습니다",
          piiTypes: piiHits,
          requiresConfirmation: true,
        });
        return;
      }
    }
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (d.title !== undefined) patch.title = d.title;
    if (d.category !== undefined) patch.category = d.category;
    if (d.summary !== undefined) patch.summary = d.summary;
    if (d.bodyText !== undefined) patch.bodyText = d.bodyText;
    if (d.fileUrl !== undefined) patch.fileUrl = d.fileUrl;
    if (d.fileName !== undefined) patch.fileName = d.fileName;
    if (d.effectiveDate !== undefined) patch.effectiveDate = d.effectiveDate;
    if (d.version !== undefined) patch.version = d.version;
    if (d.isActive !== undefined) patch.isActive = d.isActive;

    // 새 첨부가 들어왔다면 DB 업데이트 전에 비공개 ACL 설정을 먼저 시도.
    // 실패하면 doc 변경 자체를 적용하지 않는다.
    if (d.fileUrl) {
      try {
        await lockDownAttachment(d.fileUrl, req.user!.userId);
      } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : "첨부 권한 설정 실패" });
        return;
      }
    }
    const [updated] = await db
      .update(platformKnowledgeDocsTable)
      .set(patch)
      .where(eq(platformKnowledgeDocsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "자료를 찾을 수 없습니다" });
      return;
    }
    res.json(updated);
  },
);

router.delete(
  "/platform/knowledge-docs/:id",
  requireRole("platform_admin", "hq_executive"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "유효한 ID가 필요합니다" });
      return;
    }
    const result = await db
      .delete(platformKnowledgeDocsTable)
      .where(eq(platformKnowledgeDocsTable.id, id))
      .returning({ id: platformKnowledgeDocsTable.id });
    if (result.length === 0) {
      res.status(404).json({ error: "자료를 찾을 수 없습니다" });
      return;
    }
    res.json({ ok: true });
  },
);

export default router;
