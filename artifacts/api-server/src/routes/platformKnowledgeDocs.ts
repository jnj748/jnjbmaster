import { Router, type IRouter, type Request, type Response } from "express";
import { createHash } from "crypto";
import { desc, eq, and, ne } from "drizzle-orm";
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

// 플랫폼이 관리하는 공통 지식 자료(법령/개정안/가이드 등) CRUD.
// 관리소장 AI 비서가 공통 컨텍스트로 참조한다.

// 본문 입력 검증:
//  - 최대 길이 10만 자(저장/메모리 폭주 방지). AI 컨텍스트는 별도로 8000자 캡 적용.
//  - fileUrl 은 반드시 내부 객체 스토리지 경로(/objects/...)만 허용해
//    외부 URL 주입을 차단한다.
const BODY_TEXT_MAX = 100_000;
const FILE_URL_RE = /^\/objects\/[^\s?#]+$/;

// [Task #533] 자동 본문 추출/해시 계산 시 메모리 폭주 방지용 상한.
//   200MB 를 넘는 첨부는 추출하지 않고 "unsupported" 로 응답해 사용자가
//   직접 본문을 붙여 넣도록 유도한다.
const EXTRACT_MAX_BYTES = 200 * 1024 * 1024;

// SHA-256 hex 64자 (소문자 강제). 클라이언트가 만져 보내는 임의 값을 차단.
const FILE_HASH_RE = /^[a-f0-9]{64}$/;

const CreateBody = z.object({
  title: z.string().min(1).max(200),
  category: z.string().min(1).max(60).default("기타"),
  summary: z.string().max(500).nullable().optional(),
  bodyText: z.string().max(BODY_TEXT_MAX).default(""),
  fileUrl: z.string().regex(FILE_URL_RE, "내부 업로드 경로만 허용됩니다").nullable().optional(),
  fileName: z.string().max(300).nullable().optional(),
  // [Task #533] 같은 파일 재업로드 감지용 SHA-256 해시(소문자 hex 64자).
  fileHash: z.string().regex(FILE_HASH_RE, "유효한 파일 해시가 아닙니다").nullable().optional(),
  effectiveDate: z.string().nullable().optional(),
  version: z.string().max(50).nullable().optional(),
  isActive: z.boolean().optional(),
  // [Task #283] 역할별 자료 노출 대상. NULL/빈배열이면 전체 공통.
  targetRoles: z.array(z.string()).nullable().optional(),
  // PII 감지 우회 확인 — 사용자가 "확인했습니다" 동의 후 재전송 시 true.
  confirmPii: z.boolean().optional(),
  // [Task #533] 같은 file_hash 가 이미 존재해도 그래도 등록 — 사용자가
  //   중복 경고를 보고 명시적으로 동의한 경우만 true.
  confirmDuplicate: z.boolean().optional(),
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

// [Task #533] 같은 파일이 이미 등록되어 있는지 확인.
//   - selfId 가 주어지면 자기 자신과의 중복은 무시(수정 케이스).
//   - 가장 최근에 등록된 1건만 반환해 사용자에게 보여 준다.
async function findExistingByHash(
  fileHash: string,
  selfId: number | null,
): Promise<{ id: number; title: string } | null> {
  const where = selfId
    ? and(eq(platformKnowledgeDocsTable.fileHash, fileHash), ne(platformKnowledgeDocsTable.id, selfId))
    : eq(platformKnowledgeDocsTable.fileHash, fileHash);
  const rows = await db
    .select({
      id: platformKnowledgeDocsTable.id,
      title: platformKnowledgeDocsTable.title,
    })
    .from(platformKnowledgeDocsTable)
    .where(where)
    .orderBy(desc(platformKnowledgeDocsTable.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

router.get(
  "/platform/knowledge-docs",
  requireRole("platform_admin", "hq_executive"),
  async (req, res): Promise<void> => {
    const role = typeof req.query.role === "string" ? req.query.role : "";
    const rows = await db
      .select()
      .from(platformKnowledgeDocsTable)
      .orderBy(desc(platformKnowledgeDocsTable.createdAt));
    // [Task #283] ?role= 가 주어지면 targetRoles 가 NULL/빈배열(전체 공통) 이거나
    //   해당 role 을 포함하는 행만 반환한다.
    const filtered = role
      ? rows.filter((r) => {
          const tr = (r as { targetRoles?: string[] | null }).targetRoles;
          return !tr || tr.length === 0 || tr.includes(role);
        })
      : rows;
    res.json(filtered);
  },
);

// [Task #533] 업로드된 첨부에서 본문 텍스트와 SHA-256 해시를 추출한다.
//   - 입력: { objectPath: "/objects/..." }
//   - 응답: { bodyText, fileHash, mimeType, charCount, extractor }
//     - extractor: "txt" | "pdf" | "docx" | "unsupported" | "failed"
//   - 추출 실패는 200 으로 응답해 업로드 자체는 성공으로 간주한다(프론트가
//     사용자에게 "직접 입력" 안내만 띄우게 하기 위함).
//   - 파일은 스트리밍해 메모리 폭주를 막는다(EXTRACT_MAX_BYTES 초과 시 중단).
router.post(
  "/platform/knowledge-docs/extract-text",
  requireRole("platform_admin", "hq_executive"),
  async (req: Request, res: Response): Promise<void> => {
    const { objectPath } = req.body ?? {};
    if (typeof objectPath !== "string" || !FILE_URL_RE.test(objectPath)) {
      res.status(400).json({ error: "objectPath(/objects/...) 가 필요합니다" });
      return;
    }
    let buffer: Buffer | null = null;
    let mimeType = "application/octet-stream";
    let truncatedBytes = false;
    try {
      const file = await objectStorageService.getObjectEntityFile(objectPath);
      const [metadata] = await file.getMetadata();
      mimeType = (metadata.contentType as string) || "application/octet-stream";

      // 스트림으로 읽으면서 (a) SHA-256 해시 (b) 본문 추출용 버퍼 누적.
      // 두 작업을 한 번의 read 로 처리해 GCS 다운로드 비용을 한 번만 낸다.
      const hash = createHash("sha256");
      const chunks: Buffer[] = [];
      let total = 0;
      const stream = file.createReadStream();
      await new Promise<void>((resolve, reject) => {
        stream.on("data", (chunk: Buffer) => {
          hash.update(chunk);
          total += chunk.length;
          if (total <= EXTRACT_MAX_BYTES) {
            chunks.push(chunk);
          } else if (!truncatedBytes) {
            truncatedBytes = true;
            // 큰 파일은 본문 추출은 포기하지만 해시 계산은 끝까지 수행해야
            //   "같은 파일" 판정을 정확히 할 수 있으므로 stream 은 destroy 하지 않는다.
            chunks.length = 0;
          }
        });
        stream.on("end", () => resolve());
        stream.on("error", (err) => reject(err));
      });
      const fileHash = hash.digest("hex");

      if (truncatedBytes) {
        res.json({
          bodyText: "",
          fileHash,
          mimeType,
          charCount: 0,
          extractor: "unsupported",
          reason: "파일이 너무 커 본문을 추출하지 못했습니다",
        });
        return;
      }

      buffer = Buffer.concat(chunks);

      // 확장자/MIME 기준 파서 선택.
      const lower = (objectPath || "").toLowerCase();
      const isPdf = mimeType === "application/pdf" || lower.endsWith(".pdf");
      const isDocx =
        mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        lower.endsWith(".docx");
      const isHwp = lower.endsWith(".hwp") || lower.endsWith(".hwpx");
      const isTxt =
        mimeType === "text/plain" || lower.endsWith(".txt") || lower.endsWith(".md");

      let bodyText = "";
      let extractor: "txt" | "pdf" | "docx" | "unsupported" | "failed" = "unsupported";

      try {
        if (isTxt) {
          bodyText = buffer.toString("utf8");
          extractor = "txt";
        } else if (isPdf) {
          // pdf-parse 의 index.js 가 패키지 루트의 test PDF 를 require 시점에
          // 읽어 ENOENT 를 던지는 알려진 이슈가 있어 lib 진입점을 직접 import 한다.
          const pdfParseMod = await import("pdf-parse/lib/pdf-parse.js");
          const pdfParse = (pdfParseMod as unknown as { default: (b: Buffer) => Promise<{ text: string }> }).default;
          const out = await pdfParse(buffer);
          bodyText = out.text ?? "";
          extractor = "pdf";
        } else if (isDocx) {
          const mammothMod = await import("mammoth");
          const mammoth = (mammothMod as unknown as {
            default?: { extractRawText: (i: { buffer: Buffer }) => Promise<{ value: string }> };
            extractRawText?: (i: { buffer: Buffer }) => Promise<{ value: string }>;
          });
          const extractRawText = mammoth.extractRawText ?? mammoth.default?.extractRawText;
          if (!extractRawText) throw new Error("mammoth.extractRawText not available");
          const out = await extractRawText({ buffer });
          bodyText = out.value ?? "";
          extractor = "docx";
        } else if (isHwp) {
          // HWP/HWPX 는 외부 라이브러리가 필요해 이번 버전에서는 미지원.
          extractor = "unsupported";
        } else {
          extractor = "unsupported";
        }
      } catch (parseErr) {
        logger.warn({ err: parseErr, objectPath, mimeType }, "Knowledge doc text extraction failed");
        bodyText = "";
        extractor = "failed";
      }

      // 정규화: 윈도우 줄바꿈 통일, 양 끝 공백 정리, 본문 한도(BODY_TEXT_MAX) 적용.
      bodyText = bodyText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
      if (bodyText.length > BODY_TEXT_MAX) bodyText = bodyText.slice(0, BODY_TEXT_MAX);

      res.json({
        bodyText,
        fileHash,
        mimeType,
        charCount: bodyText.length,
        extractor,
      });
    } catch (err) {
      // 객체 자체를 못 찾는 등 인프라 오류라도 200 + failed 로 응답해
      // 업로드 단계는 성공으로 간주한다(프론트는 사용자에게 안내만 띄움).
      logger.warn({ err, objectPath }, "Knowledge doc extract pipeline error");
      res.json({
        bodyText: "",
        fileHash: null,
        mimeType,
        charCount: 0,
        extractor: "failed",
      });
    } finally {
      // 큰 버퍼는 명시적으로 끊어 GC 가 빨리 회수하게 함.
      buffer = null;
    }
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
    // [Task #533] 같은 파일이 이미 등록되어 있고 사용자가 명시적으로
    //   "그래도 등록" 을 누르지 않은 경우 409 로 막는다.
    if (d.fileHash && !d.confirmDuplicate) {
      const existing = await findExistingByHash(d.fileHash, null);
      if (existing) {
        res.status(409).json({
          error: `이미 등록된 자료가 있습니다: ${existing.title}`,
          requiresConfirmation: true,
          existing,
        });
        return;
      }
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
        fileHash: d.fileHash ?? null,
        effectiveDate: d.effectiveDate ?? null,
        version: d.version ?? null,
        isActive: d.isActive ?? true,
        targetRoles: d.targetRoles ?? null,
        createdBy: req.user!.userId,
        createdByName: author?.name ?? null,
      } as never)
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
    // [Task #533] 수정 시에도 같은 해시가 (자기 자신을 제외하고) 이미 있으면
    //   확인 후에만 적용한다.
    if (d.fileHash && !d.confirmDuplicate) {
      const existing = await findExistingByHash(d.fileHash, id);
      if (existing) {
        res.status(409).json({
          error: `이미 등록된 자료가 있습니다: ${existing.title}`,
          requiresConfirmation: true,
          existing,
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
    if (d.fileHash !== undefined) patch.fileHash = d.fileHash;
    if (d.effectiveDate !== undefined) patch.effectiveDate = d.effectiveDate;
    if (d.version !== undefined) patch.version = d.version;
    if (d.isActive !== undefined) patch.isActive = d.isActive;
    if (d.targetRoles !== undefined) patch.targetRoles = d.targetRoles;

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
