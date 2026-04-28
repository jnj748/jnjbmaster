import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, platformSettingsTable, usersTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth";

// [Task #504] 공고문 레이아웃 시스템 기본값.
//   본사 관리자가 한 곳에서 설정하면 공지문 템플릿 미리보기와 알림 처리완료
//   모달의 "공고문" 탭이 동일한 기본값으로 렌더링되도록 한다.
//
//   저장은 platform_settings 테이블 1행(JSON value) 으로 보관해 마이그레이션이
//   필요 없게 한다. key 는 "notice_layout_v1".

const router: IRouter = Router();

const SETTINGS_KEY = "notice_layout_v1";

const NoticeLayoutSchema = z.object({
  documentTitle: z.string().min(1).max(40),
  defaultPostingPeriod: z.string().min(1).max(80),
  contactTemplate: z.string().min(1).max(200),
  footerTemplate: z.string().min(1).max(200),
  sealOmittedText: z.string().min(1).max(40),
  showNoticeNoRow: z.boolean(),
  showBuildingRow: z.boolean(),
  showDateRow: z.boolean(),
  showContactRow: z.boolean(),
  showTitleBox: z.boolean(),
});

export type NoticeLayoutSettings = z.infer<typeof NoticeLayoutSchema>;

const DEFAULT_LAYOUT: NoticeLayoutSettings = {
  documentTitle: "공 고 문",
  defaultPostingPeriod: "상시게재",
  contactTemplate: "관리사무소 {{managementOfficePhone}}",
  footerTemplate: "{{buildingName}} 관리사무소",
  sealOmittedText: "직인생략",
  showNoticeNoRow: true,
  showBuildingRow: true,
  showDateRow: true,
  showContactRow: true,
  showTitleBox: true,
};

async function loadLayout(): Promise<NoticeLayoutSettings> {
  const [row] = await db
    .select()
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.key, SETTINGS_KEY));
  if (!row) return DEFAULT_LAYOUT;
  try {
    const parsed = NoticeLayoutSchema.partial().parse(JSON.parse(row.value));
    return { ...DEFAULT_LAYOUT, ...parsed } as NoticeLayoutSettings;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

// GET — 공고문 레이아웃 기본값 (모든 건물 운영 인력이 사용).
//   매니저/시설기사/회계/본사임원/본사관리자/입주민 카드 작성자는 모두 미리보기에서
//   이 값을 읽어 동일한 양식으로 렌더한다.
router.get(
  "/notice-layout",
  requireRole(
    "manager",
    "accountant",
    "facility_staff",
    "hq_executive",
    "platform_admin",
    "partner",
  ),
  async (_req, res): Promise<void> => {
    const layout = await loadLayout();
    res.json(layout);
  },
);

// PUT — platform_admin 전용.
router.put(
  "/notice-layout",
  requireRole("platform_admin"),
  async (req, res): Promise<void> => {
    const parsed = NoticeLayoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const actorId = req.user?.userId ?? null;
    let actorName: string | null = null;
    if (actorId) {
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, actorId));
      actorName = u?.name ?? req.user?.email ?? null;
    }
    const value = JSON.stringify(parsed.data);
    const existing = await db
      .select()
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, SETTINGS_KEY));
    if (existing.length > 0) {
      await db
        .update(platformSettingsTable)
        .set({ value, updatedBy: actorName })
        .where(eq(platformSettingsTable.key, SETTINGS_KEY));
    } else {
      await db.insert(platformSettingsTable).values({
        key: SETTINGS_KEY,
        value,
        description: "[Task #504] 공고문 레이아웃 시스템 기본값",
        updatedBy: actorName,
      });
    }
    res.json(parsed.data);
  },
);

export default router;
