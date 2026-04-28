// [Task #532] 알림 벨 수신자 필터 정상화.
//
// notifications 테이블의 recipient_type 컬럼은 발신부 코드별로 제각각이었다
// ("admin" / "hq" / "hq_executive" / "facility_manager" / "vendor" /
//  "manager" / "manager:<buildingId>" / "vendor:<id>" / "user:<id>" / "all" 등).
// 수신부(/notifications, /notifications/unread-count) 는 이 값들을 해석하지
// 않고 모든 미읽음 행을 반환하고 있어 본인과 무관한 알림이 사용자 벨에
// 노출되었다.
//
// 이 모듈은 발신부에서 어떤 키를 넣어도 다음 4가지 정규형으로만 적재되도록
// 매핑한다 (수신부도 같은 4가지만 본다):
//
//   - "all"
//   - "role:<userRole>"      (userRoles enum 의 한 값)
//   - "user:<userId>"
//   - "vendor:<partnerId>"
//
// 비표준 입력에 대한 매핑 규칙:
//   - "admin"           → ["role:platform_admin", "role:hq_executive"]  (fan-out)
//   - "hq"|"hq_executive"→ ["role:hq_executive"]
//   - "platform_admin"  → ["role:platform_admin"]
//   - "facility_manager"→ ["role:facility_staff"]
//   - "facility_staff"  → ["role:facility_staff"]
//   - "manager"         → ["role:manager"]
//   - "accountant"      → ["role:accountant"]
//   - "partner"|"vendor"→ ["role:partner"]
//   - "manager:<id>"    → fan-out: 해당 building 의 manager 유저 별 user:<id>
//                          (매니저가 없으면 platform_admin + hq_executive 폴백)
//   - 그 외 알 수 없는 값 → ["role:platform_admin", "role:hq_executive"] 폴백
//
// 발신부는 이 모듈의 insertNotification() 만 호출하도록 통일한다.

import { db, notificationsTable, usersTable } from "@workspace/db";
import type { InferInsertModel } from "drizzle-orm";
import { and, eq, inArray, or, sql } from "drizzle-orm";

type RawInsert = InferInsertModel<typeof notificationsTable>;

export interface NotificationPayload extends Omit<RawInsert, "recipientType"> {
  recipientType: string;
}

// 트랜잭션 핸들과 글로벌 db 가 공통으로 노출하는 최소 인터페이스. `db.transaction(async tx => ...)`
// 안에서 호출할 때는 같은 tx 를 넘겨 트랜잭션 경계를 유지한다.
type DbExecutor = Pick<typeof db, "select" | "insert">;

const ADMIN_FANOUT = ["role:platform_admin", "role:hq_executive"] as const;

// 알림 수신자로 허용되는 role 값 (lib/db userRoles enum 과 동일).
// 잘못된 호출자가 `role:foo` 같은 값을 넘기면 모두 ADMIN_FANOUT 으로 폴백한다.
const KNOWN_ROLES = new Set([
  "manager",
  "partner",
  "platform_admin",
  "hq_executive",
  "accountant",
  "facility_staff",
]);

function isPositiveIntString(s: string): boolean {
  return /^[1-9][0-9]*$/.test(s);
}

export async function normalizeRecipientType(
  input: string,
  executor: DbExecutor = db,
): Promise<string[]> {
  const v = (input ?? "").trim();
  if (!v) return [...ADMIN_FANOUT];
  if (v === "all") return ["all"];

  if (v.startsWith("role:")) {
    const r = v.slice("role:".length);
    return KNOWN_ROLES.has(r) ? [v] : [...ADMIN_FANOUT];
  }
  if (v.startsWith("user:")) {
    const id = v.slice("user:".length);
    return isPositiveIntString(id) ? [v] : [...ADMIN_FANOUT];
  }
  if (v.startsWith("vendor:")) {
    const id = v.slice("vendor:".length);
    return isPositiveIntString(id) ? [v] : [...ADMIN_FANOUT];
  }

  if (v === "admin") return [...ADMIN_FANOUT];
  if (v === "hq" || v === "hq_executive") return ["role:hq_executive"];
  if (v === "platform_admin") return ["role:platform_admin"];
  if (v === "facility_manager" || v === "facility_staff") {
    return ["role:facility_staff"];
  }
  if (v === "manager") return ["role:manager"];
  if (v === "accountant") return ["role:accountant"];
  if (v === "partner" || v === "vendor") return ["role:partner"];

  if (v.startsWith("manager:")) {
    const buildingId = Number(v.slice("manager:".length));
    if (!Number.isFinite(buildingId)) return [...ADMIN_FANOUT];
    const managers = await executor
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(eq(usersTable.role, "manager"), eq(usersTable.buildingId, buildingId)),
      );
    if (managers.length === 0) return [...ADMIN_FANOUT];
    return managers.map((m) => `user:${m.id}`);
  }

  return [...ADMIN_FANOUT];
}

/**
 * 발신부가 호출하는 단일 진입점. recipientType 을 정규화한 뒤 1개 또는
 * 여러 개의 알림 행을 일괄 적재하고 적재된 row 들을 반환한다.
 *
 * 비표준 키(`admin` 등) 가 들어오면 여러 행이 적재될 수 있으므로 호출부가
 * "삽입된 단일 알림 ID" 를 가정해서는 안 된다. 단일 ID 가 필요한 호출부는
 * 정규형(`role:<x>` / `user:<id>` / `vendor:<id>` / `all`) 키를 사용해야
 * 한 행만 적재됨이 보장된다.
 */
export async function insertNotification(
  payload: NotificationPayload,
  executor: DbExecutor = db,
): Promise<Array<typeof notificationsTable.$inferSelect>> {
  const recipients = await normalizeRecipientType(payload.recipientType, executor);
  if (recipients.length === 0) return [];
  const rows: RawInsert[] = recipients.map((r) => ({
    ...payload,
    recipientType: r,
  }));
  return await executor.insert(notificationsTable).values(rows).returning();
}

// ---------------------------------------------------------------------------
// 수신부 (/notifications, /notifications/unread-count) 가 사용하는 필터.
// ---------------------------------------------------------------------------

export interface RecipientContext {
  userId: number;
  role: string;
  vendorId: number | null;
}

export async function loadRecipientContext(
  userId: number,
  role: string,
): Promise<RecipientContext> {
  if (role === "partner") {
    const [u] = await db
      .select({ vendorId: usersTable.vendorId })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    return { userId, role, vendorId: u?.vendorId ?? null };
  }
  return { userId, role, vendorId: null };
}

export function recipientTokensFor(ctx: RecipientContext): string[] {
  const tokens = ["all", `role:${ctx.role}`, `user:${ctx.userId}`];
  if (ctx.vendorId != null) tokens.push(`vendor:${ctx.vendorId}`);
  return tokens;
}

/**
 * Drizzle WHERE 조건. /notifications 와 /notifications/unread-count 가 이
 * 헬퍼를 공유해 카운트와 목록 건수가 항상 일치하도록 한다.
 */
export function recipientWhere(ctx: RecipientContext) {
  const tokens = recipientTokensFor(ctx);
  return inArray(notificationsTable.recipientType, tokens);
}

// drizzle-orm `or`/`sql` re-export for callers that need them along with the
// where helper.
export { or, sql };
