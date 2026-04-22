import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./lib/logger";

const PLATFORM_ADMINS: Array<{
  email: string;
  password: string;
  name: string;
}> = [
  {
    email: "admin@jnjproperty.co.kr",
    password: "071029jj!@#",
    name: "관리자",
  },
];

export async function seedPlatformAdmins() {
  for (const admin of PLATFORM_ADMINS) {
    try {
      const passwordHash = await bcrypt.hash(admin.password, 10);
      const existing = await db
        .select({ id: usersTable.id, passwordHash: usersTable.passwordHash })
        .from(usersTable)
        .where(eq(usersTable.email, admin.email));

      if (existing.length === 0) {
        await db.insert(usersTable).values({
          email: admin.email,
          passwordHash,
          name: admin.name,
          role: "platform_admin",
          portalType: "hq",
          buildingId: null,
          roleSelected: true,
          approvalStatus: "active",
        });
        logger.info({ email: admin.email }, "Platform admin seeded");
      } else {
        const current = existing[0];
        const same = current.passwordHash
          ? await bcrypt.compare(admin.password, current.passwordHash)
          : false;
        if (!same) {
          await db
            .update(usersTable)
            .set({
              passwordHash,
              role: "platform_admin",
              portalType: "hq",
              approvalStatus: "active",
              roleSelected: true,
            })
            .where(eq(usersTable.id, current.id));
          logger.info({ email: admin.email }, "Platform admin password reset");
        }
      }
    } catch (e) {
      logger.warn({ email: admin.email, err: e }, "Failed to seed platform admin");
    }
  }
}
