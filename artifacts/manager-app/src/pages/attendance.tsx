import { useState, useMemo } from "react";
import {
  useGetTodayAttendance,
  useGetMyAttendance,
  useGetAttendanceStats,
  useGetAllAttendance,
  useCheckAttendance,
  getGetTodayAttendanceQueryKey,
  getGetMyAttendanceQueryKey,
  getGetAttendanceStatsQueryKey,
  getGetAllAttendanceQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  LogIn,
  LogOut,
  Clock,
  Monitor,
  Smartphone,
  CalendarDays,
  Users,
  TrendingUp,
  AlertTriangle,
  BarChart3,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const now = new Date();
const currentMonth = now.getMonth() + 1;
const currentYear = now.getFullYear();

function statusLabel(s: string) {
  switch (s) {
    case "normal": return "정상";
    case "late": return "지각";
    case "early_leave": return "조퇴";
    case "absent": return "결근";
    default: return s;
  }
}

function statusVariant(s: string): "default" | "destructive" | "secondary" | "outline" {
  switch (s) {
    case "normal": return "default";
    case "late": return "destructive";
    case "early_leave": return "secondary";
    case "absent": return "destructive";
    default: return "outline";
  }
}

function formatTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export default function Attendance() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isManager = user?.role === "manager" || user?.role === "platform_admin";
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const checkMutation = useCheckAttendance();

  const { data: todayRecords, isLoading: todayLoading } = useGetTodayAttendance();
  const { data: myRecords, isLoading: myLoading } = useGetMyAttendance({
    month: selectedMonth,
    year: selectedYear,
  });
  const { data: myStats, isLoading: statsLoading } = useGetAttendanceStats({
    month: selectedMonth,
    year: selectedYear,
  });
  const { data: allStaff, isLoading: allLoading } = useGetAllAttendance(
    { month: selectedMonth, year: selectedYear },
    { query: { enabled: isManager } }
  );

  const hasCheckedIn = todayRecords?.some((r) => r.checkType === "check_in");
  const hasCheckedOut = todayRecords?.some((r) => r.checkType === "check_out");

  async function handleCheck(checkType: "check_in" | "check_out") {
    try {
      await checkMutation.mutateAsync({ data: { checkType } });
      queryClient.invalidateQueries({ queryKey: getGetTodayAttendanceQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetMyAttendanceQueryKey({ month: selectedMonth, year: selectedYear }) });
      queryClient.invalidateQueries({ queryKey: getGetAttendanceStatsQueryKey({ month: selectedMonth, year: selectedYear }) });
      if (isManager) {
        queryClient.invalidateQueries({ queryKey: getGetAllAttendanceQueryKey({ month: selectedMonth, year: selectedYear }) });
      }
      toast({
        title: checkType === "check_in" ? "출근 체크 완료" : "퇴근 체크 완료",
      });
    } catch {
      toast({ title: "오류가 발생했습니다", variant: "destructive" });
    }
  }

  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const years = [currentYear - 1, currentYear];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">출퇴근 관리</h1>
        <p className="text-muted-foreground text-sm mt-1">
          출퇴근 체크 및 근태 현황을 확인합니다
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" />
            오늘 출퇴근 체크
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Button
              size="lg"
              onClick={() => handleCheck("check_in")}
              disabled={hasCheckedIn || checkMutation.isPending}
              className="flex-1"
            >
              <LogIn className="w-5 h-5 mr-2" />
              {hasCheckedIn ? "출근 완료" : "출근 체크"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => handleCheck("check_out")}
              disabled={!hasCheckedIn || hasCheckedOut || checkMutation.isPending}
              className="flex-1"
            >
              <LogOut className="w-5 h-5 mr-2" />
              {hasCheckedOut ? "퇴근 완료" : "퇴근 체크"}
            </Button>
          </div>
          {todayLoading ? (
            <Skeleton className="h-10 mt-4" />
          ) : todayRecords && todayRecords.length > 0 ? (
            <div className="mt-4 space-y-2">
              {todayRecords.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm p-2 rounded bg-muted/50">
                  <div className="flex items-center gap-2">
                    {r.checkType === "check_in" ? (
                      <LogIn className="w-4 h-4 text-chart-2" />
                    ) : (
                      <LogOut className="w-4 h-4 text-chart-3" />
                    )}
                    <span>{r.checkType === "check_in" ? "출근" : "퇴근"}</span>
                    <span className="text-muted-foreground">
                      {formatTime(r.checkType === "check_in" ? r.checkInTime : r.checkOutTime)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.deviceType === "mobile" ? (
                      <Smartphone className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                      <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                    <Badge variant={statusVariant(r.status)}>{statusLabel(r.status)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-4 text-center py-2">
              오늘 출퇴근 기록이 없습니다
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}년</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m} value={String(m)}>{m}월</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="my" className="w-full">
        <TabsList>
          <TabsTrigger value="my">내 근태</TabsTrigger>
          {isManager && <TabsTrigger value="all">전체 현황</TabsTrigger>}
        </TabsList>

        <TabsContent value="my" className="space-y-4">
          {statsLoading ? (
            <Skeleton className="h-32" />
          ) : myStats ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">근무일</p>
                  <p className="text-xl font-bold mt-1">{myStats.totalWorkDays}일</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">출근</p>
                  <p className="text-xl font-bold mt-1 text-chart-2">{myStats.presentDays}일</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">지각</p>
                  <p className="text-xl font-bold mt-1 text-destructive">{myStats.lateDays}일</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">조퇴</p>
                  <p className="text-xl font-bold mt-1 text-chart-3">{myStats.earlyLeaveDays}일</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">출근율</p>
                  <p className="text-xl font-bold mt-1">{myStats.attendanceRate}%</p>
                </CardContent>
              </Card>
            </div>
          ) : null}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="w-4 h-4" />
                일별 기록
              </CardTitle>
            </CardHeader>
            <CardContent>
              {myLoading ? (
                <Skeleton className="h-40" />
              ) : myRecords && myRecords.length > 0 ? (
                <>
                  <div className="hidden desktop:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>날짜</TableHead>
                          <TableHead>구분</TableHead>
                          <TableHead>시간</TableHead>
                          <TableHead>상태</TableHead>
                          <TableHead>기기</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {myRecords.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell>{r.checkDate}</TableCell>
                            <TableCell>{r.checkType === "check_in" ? "출근" : "퇴근"}</TableCell>
                            <TableCell>
                              {formatTime(r.checkType === "check_in" ? r.checkInTime : r.checkOutTime)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusVariant(r.status)}>{statusLabel(r.status)}</Badge>
                            </TableCell>
                            <TableCell>
                              {r.deviceType === "mobile" ? (
                                <Smartphone className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <Monitor className="w-4 h-4 text-muted-foreground" />
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="desktop:hidden space-y-2">
                    {myRecords.map((r) => (
                      <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border bg-card min-h-[44px]">
                        <div className="flex items-center gap-3 min-w-0">
                          {r.checkType === "check_in" ? (
                            <LogIn className="w-4 h-4 text-chart-2 shrink-0" />
                          ) : (
                            <LogOut className="w-4 h-4 text-chart-3 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-medium">{r.checkDate}</div>
                            <div className="text-xs text-muted-foreground">
                              {r.checkType === "check_in" ? "출근" : "퇴근"} · {formatTime(r.checkType === "check_in" ? r.checkInTime : r.checkOutTime)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {r.deviceType === "mobile" ? (
                            <Smartphone className="w-3.5 h-3.5 text-muted-foreground" />
                          ) : (
                            <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                          <Badge variant={statusVariant(r.status)}>{statusLabel(r.status)}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  해당 월 기록이 없습니다
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isManager && (
          <TabsContent value="all" className="space-y-4">
            {allLoading ? (
              <Skeleton className="h-80" />
            ) : allStaff && allStaff.length > 0 ? (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <BarChart3 className="w-4 h-4" />
                        직원별 출근율
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={allStaff.map((s) => ({ name: s.userName, 출근율: s.attendanceRate }))}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" fontSize={12} />
                          <YAxis domain={[0, 100]} unit="%" fontSize={12} />
                          <Tooltip formatter={(v: number) => `${v}%`} />
                          <Bar dataKey="출근율" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        지각/조퇴 빈도
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={allStaff.map((s) => ({ name: s.userName, 지각: s.lateDays, 조퇴: s.earlyLeaveDays, 결근: s.absentDays }))}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" fontSize={12} />
                          <YAxis fontSize={12} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="지각" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="조퇴" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="결근" fill="hsl(var(--chart-5))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      직원별 근태 상세
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="hidden desktop:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>직원명</TableHead>
                            <TableHead>직급</TableHead>
                            <TableHead>출근일</TableHead>
                            <TableHead>지각</TableHead>
                            <TableHead>조퇴</TableHead>
                            <TableHead>결근</TableHead>
                            <TableHead>출근율</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {allStaff.map((s) => (
                            <TableRow key={s.userId}>
                              <TableCell className="font-medium">{s.userName}</TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {s.role === "manager" ? "관리소장" : s.role === "facility_staff" ? "시설기사" : s.role === "accountant" ? "경리/회계" : s.role}
                                </Badge>
                              </TableCell>
                              <TableCell>{s.presentDays}일</TableCell>
                              <TableCell>
                                {s.lateDays > 0 ? (
                                  <span className="text-destructive font-medium">{s.lateDays}일</span>
                                ) : (
                                  "0일"
                                )}
                              </TableCell>
                              <TableCell>
                                {s.earlyLeaveDays > 0 ? (
                                  <span className="text-chart-3 font-medium">{s.earlyLeaveDays}일</span>
                                ) : (
                                  "0일"
                                )}
                              </TableCell>
                              <TableCell>
                                {s.absentDays > 0 ? (
                                  <span className="text-destructive font-medium">{s.absentDays}일</span>
                                ) : (
                                  "0일"
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-chart-2 rounded-full"
                                      style={{ width: `${Math.min(s.attendanceRate, 100)}%` }}
                                    />
                                  </div>
                                  <span className="text-sm">{s.attendanceRate}%</span>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="desktop:hidden space-y-3">
                      {allStaff.map((s) => (
                        <div key={s.userId} className="p-3 rounded-lg border bg-card space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{s.userName}</span>
                              <Badge variant="outline" className="text-xs">
                                {s.role === "manager" ? "관리소장" : s.role === "facility_staff" ? "시설기사" : s.role === "accountant" ? "경리/회계" : s.role}
                              </Badge>
                            </div>
                            <span className="text-sm font-semibold">{s.attendanceRate}%</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-chart-2 rounded-full"
                                style={{ width: `${Math.min(s.attendanceRate, 100)}%` }}
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-4 gap-2 text-center text-xs">
                            <div>
                              <p className="text-muted-foreground">출근</p>
                              <p className="font-medium">{s.presentDays}일</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">지각</p>
                              <p className={s.lateDays > 0 ? "font-medium text-destructive" : "font-medium"}>{s.lateDays}일</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">조퇴</p>
                              <p className={s.earlyLeaveDays > 0 ? "font-medium text-chart-3" : "font-medium"}>{s.earlyLeaveDays}일</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">결근</p>
                              <p className={s.absentDays > 0 ? "font-medium text-destructive" : "font-medium"}>{s.absentDays}일</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">해당 월 데이터가 없습니다</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
