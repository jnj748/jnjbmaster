import { Router, type IRouter } from "express";
import { and, desc, eq, sql, inArray, type SQL } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  usersTable,
  referralBenefitsTable,
  referralBenefitKinds,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth";

// [Task #582] 본사(platform_admin) 추천인 관리 대시보드.
//   가입 시 입력된 users.referrer_phone(정규화된 11자리) 단위로 집계 + 베네핏 지급 기록.

const router: IRouter = Router();
const platformAdminOnly = requireRole("platform_admin");

// 정규화된 11자리 휴대폰만 path/검색에 받는다.
function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = String(raw).replace(/\D+/g, "");
  return /^010\d{8}$/.test(d) ? d : null;
}

// ── GET /admin/referrers : 집계 목록 ────────────────────────
const ListQuery = z.object({
  q: z.string().optional(),
  sort: z
    .enum(["signups_desc", "signups_asc", "recent_desc", "recent_asc", "phone_asc"])
    .default("signups_desc"),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

type AggregateRow = {
  referrerPhone: string;
  signupCount: number;
  latestSignupAt: string | null;
  matchedUser: { id: number; fullName: string; role: string } | null;
  benefitTotalAmount: number;
  benefitCount: number;
  latestBenefitAt: string | null;
};

async function buildAggregates(filterDigits: string | null): Promise<AggregateRow[]> {
  // 1) referrer_phone 단위 가입 집계.
  const conds: SQL[] = [sql`${usersTable.referrerPhone} IS NOT NULL`];
  if (filterDigits) {
    conds.push(sql`${usersTable.referrerPhone} LIKE ${"%" + filterDigits + "%"}`);
  }
  const groups = await db
    .select({
      referrerPhone: usersTable.referrerPhone,
      signupCount: sql<number>`count(*)::int`,
      latestSignupAt: sql<Date | null>`max(${usersTable.createdAt})`,
    })
    .from(usersTable)
    .where(and(...conds))
    .groupBy(usersTable.referrerPhone);

  if (groups.length === 0) return [];

  const phones = groups.map((g) => g.referrerPhone!).filter(Boolean);

  // 2) phone 매칭되는 회원. users.phone 은 보통 하이픈 포함 형식으로 저장되므로
  //    DB 측에서 비숫자 문자를 모두 제거(regexp_replace) 한 결과로 비교한다.
  const matched = phones.length
    ? await db
        .select({
          id: usersTable.id,
          fullName: usersTable.name,
          role: usersTable.role,
          phoneDigits: sql<string>`regexp_replace(coalesce(${usersTable.phone}, ''), '\\D', '', 'g')`,
        })
        .from(usersTable)
        .where(
          sql`regexp_replace(coalesce(${usersTable.phone}, ''), '\\D', '', 'g') = ANY(${phones})`,
        )
    : [];
  const matchedByPhone = new Map<string, { id: number; fullName: string; role: string }>();
  for (const m of matched) {
    if (!m.phoneDigits) continue;
    if (!matchedByPhone.has(m.phoneDigits)) {
      matchedByPhone.set(m.phoneDigits, { id: m.id, fullName: m.fullName, role: m.role });
    }
  }

  // 3) 베네핏 합계 + 마지막 지급일.
  const benefits = phones.length
    ? await db
        .select({
          referrerPhone: referralBenefitsTable.referrerPhone,
          benefitTotalAmount: sql<number>`coalesce(sum(${referralBenefitsTable.amount}), 0)::int`,
          benefitCount: sql<number>`count(*)::int`,
          latestBenefitAt: sql<Date | null>`max(${referralBenefitsTable.grantedAt})`,
        })
        .from(referralBenefitsTable)
        .where(inArray(referralBenefitsTable.referrerPhone, phones))
        .groupBy(referralBenefitsTable.referrerPhone)
    : [];
  const benefitByPhone = new Map(benefits.map((b) => [b.referrerPhone, b]));

  return groups.map((g) => {
    const phone = g.referrerPhone!;
    const ben = benefitByPhone.get(phone);
    return {
      referrerPhone: phone,
      signupCount: Number(g.signupCount),
      latestSignupAt: g.latestSignupAt ? new Date(g.latestSignupAt).toISOString() : null,
      matchedUser: matchedByPhone.get(phone) ?? null,
      benefitTotalAmount: Number(ben?.benefitTotalAmount ?? 0),
      benefitCount: Number(ben?.benefitCount ?? 0),
      latestBenefitAt: ben?.latestBenefitAt ? new Date(ben.latestBenefitAt).toISOString() : null,
    };
  });
}

router.get("/admin/referrers", platformAdminOnly, async (req, res): Promise<void> => {
  const parsed = ListQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { q, sort, limit, offset } = parsed.data;
  const filterDigits = q ? q.replace(/\D+/g, "") || null : null;

  const all = await buildAggregates(filterDigits);

  all.sort((a, b) => {
    switch (sort) {
      case "signups_asc": return a.signupCount - b.signupCount;
      case "signups_desc": return b.signupCount - a.signupCount;
      case "recent_desc": {
        const av = a.latestSignupAt ?? "";
        const bv = b.latestSignupAt ?? "";
        return bv.localeCompare(av);
      }
      case "recent_asc": {
        const av = a.latestSignupAt ?? "";
        const bv = b.latestSignupAt ?? "";
        return av.localeCompare(bv);
      }
      case "phone_asc": return a.referrerPhone.localeCompare(b.referrerPhone);
      default: return 0;
    }
  });

  const total = all.length;
  const page = all.slice(offset, offset + limit);
  res.json({ referrers: page, total });
});

// ── GET /admin/referrers/export : CSV ──────────────────────
router.get("/admin/referrers/export", platformAdminOnly, async (req, res): Promise<void> => {
  const all = await buildAggregates(null);
  all.sort((a, b) => b.signupCount - a.signupCount);

  const header = [
    "추천인 연락처",
    "가입자 수",
    "최근 가입일",
    "매칭 회원",
    "역할",
    "베네핏 건수",
    "베네핏 합계",
    "마지막 베네핏 지급일",
  ];
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = all.map((r) =>
    [
      r.referrerPhone,
      String(r.signupCount),
      r.latestSignupAt ? r.latestSignupAt.slice(0, 10) : "",
      r.matchedUser?.fullName ?? "",
      r.matchedUser?.role ?? "",
      String(r.benefitCount),
      String(r.benefitTotalAmount),
      r.latestBenefitAt ? r.latestBenefitAt.slice(0, 10) : "",
    ]
      .map(escape)
      .join(","),
  );
  // BOM for Excel KR.
  const csv = "\uFEFF" + [header.map(escape).join(","), ...rows].join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="referrers.csv"`);
  res.send(csv);
});

// ── GET /admin/referrers/:phone : 상세 ─────────────────────
router.get("/admin/referrers/:phone", platformAdminOnly, async (req, res): Promise<void> => {
  const phone = normalizePhone(String(req.params.phone ?? ""));
  if (!phone) {
    res.status(400).json({ error: "유효하지 않은 휴대폰 번호입니다" });
    return;
  }

  const recruited = await db
    .select({
      id: usersTable.id,
      fullName: usersTable.name,
      phone: usersTable.phone,
      role: usersTable.role,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.referrerPhone, phone))
    .orderBy(desc(usersTable.createdAt));

  // matched user (phone == referrerPhone 인 회원). users.phone 정규화 후 비교.
  const [matched = null] = await db
    .select({
      id: usersTable.id,
      fullName: usersTable.name,
      role: usersTable.role,
      phone: usersTable.phone,
    })
    .from(usersTable)
    .where(
      sql`regexp_replace(coalesce(${usersTable.phone}, ''), '\\D', '', 'g') = ${phone}`,
    )
    .limit(1);

  // benefits + grantedBy 이름.
  const rawBenefits = await db
    .select()
    .from(referralBenefitsTable)
    .where(eq(referralBenefitsTable.referrerPhone, phone))
    .orderBy(desc(referralBenefitsTable.grantedAt));

  const granterIds = Array.from(new Set(rawBenefits.map((b) => b.grantedByUserId)));
  const granters = granterIds.length
    ? await db
        .select({ id: usersTable.id, name: usersTable.name })
        .from(usersTable)
        .where(inArray(usersTable.id, granterIds))
    : [];
  const granterById = new Map(granters.map((g) => [g.id, g.name]));

  const benefits = rawBenefits.map((b) => ({
    id: b.id,
    referrerPhone: b.referrerPhone,
    grantedByUserId: b.grantedByUserId,
    grantedByName: granterById.get(b.grantedByUserId) ?? null,
    kind: b.kind,
    amount: b.amount,
    memo: b.memo,
    grantedAt: b.grantedAt.toISOString(),
  }));
  const benefitTotalAmount = benefits.reduce((sum, b) => sum + b.amount, 0);

  res.json({
    referrerPhone: phone,
    matchedUser: matched
      ? { id: matched.id, fullName: matched.fullName, role: matched.role, phone: matched.phone }
      : null,
    recruitedUsers: recruited.map((r) => ({
      id: r.id,
      fullName: r.fullName,
      phone: r.phone,
      role: r.role,
      createdAt: r.createdAt.toISOString(),
    })),
    benefits,
    benefitTotalAmount,
  });
});

// ── POST /admin/referrers/:phone/benefits : 지급 기록 ───────
const CreateBenefitBody = z.object({
  kind: z.enum(referralBenefitKinds),
  amount: z.number().int().positive(),
  memo: z.string().max(500).nullable().optional(),
});

router.post(
  "/admin/referrers/:phone/benefits",
  platformAdminOnly,
  async (req, res): Promise<void> => {
    const phone = normalizePhone(String(req.params.phone ?? ""));
    if (!phone) {
      res.status(400).json({ error: "유효하지 않은 휴대폰 번호입니다" });
      return;
    }
    const parsed = CreateBenefitBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const grantedByUserId = req.user!.userId;

    const [row] = await db
      .insert(referralBenefitsTable)
      .values({
        referrerPhone: phone,
        grantedByUserId,
        kind: parsed.data.kind,
        amount: parsed.data.amount,
        memo: parsed.data.memo ?? null,
      })
      .returning();

    const [granter] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, grantedByUserId));

    req.log.info({ phone, kind: row.kind, amount: row.amount }, "[Task #582] 추천인 베네핏 기록 생성");

    res.status(201).json({
      benefit: {
        id: row.id,
        referrerPhone: row.referrerPhone,
        grantedByUserId: row.grantedByUserId,
        grantedByName: granter?.name ?? null,
        kind: row.kind,
        amount: row.amount,
        memo: row.memo,
        grantedAt: row.grantedAt.toISOString(),
      },
    });
  },
);

export default router;
