import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, attendanceTable, usersTable } from "@workspace/db";
import {
  CheckAttendanceBody,
  GetTodayAttendanceResponse,
  GetMyAttendanceQueryParams,
  GetMyAttendanceResponse,
  GetAttendanceStatsQueryParams,
  GetAttendanceStatsResponse,
  GetAllAttendanceQueryParams,
  GetAllAttendanceResponse,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();

const WORK_START_HOUR = 9;
const WORK_START_MINUTE = 0;
const WORK_END_HOUR = 18;
const WORK_END_MINUTE = 0;

function determineStatus(checkType: string, checkTime: Date): string {
  const hours = checkTime.getHours();
  const minutes = checkTime.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  if (checkType === "check_in") {
    const startMinutes = WORK_START_HOUR * 60 + WORK_START_MINUTE;
    return totalMinutes > startMinutes ? "late" : "normal";
  }

  if (checkType === "check_out") {
    const endMinutes = WORK_END_HOUR * 60 + WORK_END_MINUTE;
    return totalMinutes < endMinutes ? "early_leave" : "normal";
  }

  return "normal";
}

function getDeviceType(userAgent: string | undefined): string {
  if (!userAgent) return "unknown";
  const ua = userAgent.toLowerCase();
  if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) {
    return "mobile";
  }
  return "pc";
}

const buildingStaff = requireRole("manager", "platform_admin", "accountant", "facility_staff");

router.post("/attendance/check", buildingStaff, async (req, res): Promise<void> => {
  const parsed = CheckAttendanceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const user = req.user!;
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  const existing = await db
    .select()
    .from(attendanceTable)
    .where(
      and(
        eq(attendanceTable.userId, user.userId),
        eq(attendanceTable.checkDate, today),
        eq(attendanceTable.checkType, parsed.data.checkType)
      )
    );

  if (existing.length > 0) {
    res.status(409).json({ error: parsed.data.checkType === "check_in" ? "이미 출근 체크를 했습니다" : "이미 퇴근 체크를 했습니다" });
    return;
  }

  if (parsed.data.checkType === "check_out") {
    const checkInExists = await db
      .select()
      .from(attendanceTable)
      .where(
        and(
          eq(attendanceTable.userId, user.userId),
          eq(attendanceTable.checkDate, today),
          eq(attendanceTable.checkType, "check_in")
        )
      );
    if (checkInExists.length === 0) {
      res.status(400).json({ error: "출근 체크를 먼저 해주세요" });
      return;
    }
  }

  const userAgent = req.headers["user-agent"] || "";
  const ipAddress = req.headers["x-forwarded-for"]?.toString() || req.socket.remoteAddress || "";
  const deviceType = parsed.data.deviceType || getDeviceType(userAgent);
  const status = determineStatus(parsed.data.checkType, now);

  const [attendance] = await db.insert(attendanceTable).values({
    userId: user.userId,
    checkDate: today,
    checkType: parsed.data.checkType,
    status,
    deviceType,
    ipAddress,
    userAgent,
    note: parsed.data.note || null,
    checkInTime: parsed.data.checkType === "check_in" ? now : null,
    checkOutTime: parsed.data.checkType === "check_out" ? now : null,
  }).returning();

  const [userInfo] = await db.select().from(usersTable).where(eq(usersTable.id, user.userId));

  const result = {
    ...attendance,
    userName: userInfo?.name || "Unknown",
    checkInTime: attendance.checkInTime?.toISOString() || null,
    checkOutTime: attendance.checkOutTime?.toISOString() || null,
    createdAt: attendance.createdAt.toISOString(),
  };

  res.status(201).json(result);
});

router.get("/attendance/today", buildingStaff, async (req, res): Promise<void> => {
  const user = req.user!;
  const today = new Date().toISOString().split("T")[0];

  const records = await db
    .select()
    .from(attendanceTable)
    .where(and(eq(attendanceTable.userId, user.userId), eq(attendanceTable.checkDate, today)));

  const [userInfo] = await db.select().from(usersTable).where(eq(usersTable.id, user.userId));

  const result = records.map((r) => ({
    ...r,
    userName: userInfo?.name || "Unknown",
    checkInTime: r.checkInTime?.toISOString() || null,
    checkOutTime: r.checkOutTime?.toISOString() || null,
    createdAt: r.createdAt.toISOString(),
  }));

  res.json(GetTodayAttendanceResponse.parse(result));
});

router.get("/attendance/my", buildingStaff, async (req, res): Promise<void> => {
  const params = GetMyAttendanceQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const user = req.user!;
  const { month, year } = params.data;
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

  const records = await db
    .select()
    .from(attendanceTable)
    .where(
      and(
        eq(attendanceTable.userId, user.userId),
        sql`${attendanceTable.checkDate} >= ${startDate}`,
        sql`${attendanceTable.checkDate} < ${endDate}`
      )
    );

  const [userInfo] = await db.select().from(usersTable).where(eq(usersTable.id, user.userId));

  const result = records.map((r) => ({
    ...r,
    userName: userInfo?.name || "Unknown",
    checkInTime: r.checkInTime?.toISOString() || null,
    checkOutTime: r.checkOutTime?.toISOString() || null,
    createdAt: r.createdAt.toISOString(),
  }));

  res.json(GetMyAttendanceResponse.parse(result));
});

router.get("/attendance/stats", buildingStaff, async (req, res): Promise<void> => {
  const params = GetAttendanceStatsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const user = req.user!;
  const targetUserId = params.data.userId || user.userId;

  if (params.data.userId && params.data.userId !== user.userId) {
    if (user.role !== "manager" && user.role !== "platform_admin") {
      res.status(403).json({ error: "다른 사용자의 근태 정보를 조회할 권한이 없습니다" });
      return;
    }
  }
  const { month, year } = params.data;

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

  const records = await db
    .select()
    .from(attendanceTable)
    .where(
      and(
        eq(attendanceTable.userId, targetUserId),
        sql`${attendanceTable.checkDate} >= ${startDate}`,
        sql`${attendanceTable.checkDate} < ${endDate}`
      )
    );

  const [userInfo] = await db.select().from(usersTable).where(eq(usersTable.id, targetUserId));

  const checkInRecords = records.filter((r) => r.checkType === "check_in");
  const uniqueDates = new Set(checkInRecords.map((r) => r.checkDate));
  const presentDays = uniqueDates.size;
  const lateDays = checkInRecords.filter((r) => r.status === "late").length;

  const checkOutRecords = records.filter((r) => r.checkType === "check_out");
  const earlyLeaveDays = checkOutRecords.filter((r) => r.status === "early_leave").length;

  const now = new Date();
  const daysInMonth = new Date(year, month, 0).getDate();
  const currentDay = now.getFullYear() === year && now.getMonth() + 1 === month
    ? Math.min(now.getDate(), daysInMonth)
    : daysInMonth;

  let totalWorkDays = 0;
  for (let d = 1; d <= currentDay; d++) {
    const date = new Date(year, month - 1, d);
    const day = date.getDay();
    if (day !== 0 && day !== 6) totalWorkDays++;
  }

  const absentDays = Math.max(0, totalWorkDays - presentDays);
  const attendanceRate = totalWorkDays > 0 ? Math.round((presentDays / totalWorkDays) * 1000) / 10 : 0;

  const stats = {
    userId: targetUserId,
    userName: userInfo?.name || "Unknown",
    month,
    year,
    totalWorkDays,
    presentDays,
    lateDays,
    earlyLeaveDays,
    absentDays,
    attendanceRate,
  };

  res.json(GetAttendanceStatsResponse.parse(stats));
});

router.get("/attendance/all", requireRole("manager", "platform_admin"), async (req, res): Promise<void> => {
  const params = GetAllAttendanceQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { month, year } = params.data;
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

  const users = await db
    .select()
    .from(usersTable)
    .where(sql`${usersTable.portalType} = 'building'`);

  const allRecords = await db
    .select()
    .from(attendanceTable)
    .where(
      and(
        sql`${attendanceTable.checkDate} >= ${startDate}`,
        sql`${attendanceTable.checkDate} < ${endDate}`
      )
    );

  const now = new Date();
  const daysInMonth = new Date(year, month, 0).getDate();
  const currentDay = now.getFullYear() === year && now.getMonth() + 1 === month
    ? Math.min(now.getDate(), daysInMonth)
    : daysInMonth;

  let totalWorkDays = 0;
  for (let d = 1; d <= currentDay; d++) {
    const date = new Date(year, month - 1, d);
    const day = date.getDay();
    if (day !== 0 && day !== 6) totalWorkDays++;
  }

  const summaries = users.map((user) => {
    const userRecords = allRecords.filter((r) => r.userId === user.id);
    const checkIns = userRecords.filter((r) => r.checkType === "check_in");
    const uniqueDates = new Set(checkIns.map((r) => r.checkDate));
    const presentDays = uniqueDates.size;
    const lateDays = checkIns.filter((r) => r.status === "late").length;
    const checkOuts = userRecords.filter((r) => r.checkType === "check_out");
    const earlyLeaveDays = checkOuts.filter((r) => r.status === "early_leave").length;
    const absentDays = Math.max(0, totalWorkDays - presentDays);
    const attendanceRate = totalWorkDays > 0 ? Math.round((presentDays / totalWorkDays) * 1000) / 10 : 0;

    return {
      userId: user.id,
      userName: user.name,
      role: user.role,
      presentDays,
      lateDays,
      earlyLeaveDays,
      absentDays,
      attendanceRate,
    };
  });

  res.json(GetAllAttendanceResponse.parse(summaries));
});

export default router;
