import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useMenuOverrides } from "@/hooks/use-menu-overrides";
import ReactMarkdown from "react-markdown";
import { Link, useLocation } from "wouter";
import { QuickEntryDialog } from "@/components/work-log/quick-entry-fab";
import { CampaignModalHost } from "@/components/campaigns/campaign-modal-host";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import {
  useListNotifications,
  useGetUnreadNotificationCount,
  useMarkNotificationRead,
  useMarkAnnouncementRead,
  useListActiveCampaigns,
  useMarkCampaignRead,
  useDismissCampaign,
  useRecordCampaignImpression,
  getListActiveCampaignsQueryKey,
  useGetFacilityStatusSummary,
  getListNotificationsQueryKey,
  getGetUnreadNotificationCountQueryKey,
  type FacilityStatusBadge as FacilityBadge,
  type FacilityStatusSummary,
  type Notification,
} from "@workspace/api-client-react";
import { FacilityStatusBadge } from "@/components/facility-status-badge";
import { BrandLogo } from "@/components/brand-logo";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  LogOut,
  Settings,
  Menu,
  X,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Check,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Megaphone } from "lucide-react";
import { PlatformFooter } from "@/components/intermediary-disclaimer";
import {
  ROLE_LABELS,
  getSidebarSections,
  getBottomNavItems,
  getEffectiveRole,
  type NavItem,
  type NavSection,
  type Role,
} from "@/lib/permissions";
import { CATEGORY_ICON_CLASS, GROUP_TO_CATEGORY } from "@/lib/category-colors";

function navItemHref(item: NavItem): string {
  if (!item.query) return item.path;
  const qs = new URLSearchParams(item.query).toString();
  return qs ? `${item.path}?${qs}` : item.path;
}

function isNavItemActive(item: NavItem, location: string): boolean {
  const pathMatch = item.path === "/" ? location === "/" : location.startsWith(item.path);
  if (!pathMatch) return false;
  if (!item.query) return true;
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return Object.entries(item.query).every(([k, v]) => params.get(k) === v);
}

// All sidebar / bottom-nav definitions live in `@/lib/permissions` and are
// derived from the role × screen permission matrix (single source of truth).
// Any per-role visibility tweak must go through that file.

// [모바일 헤더 직책 라벨] 좌상단 "관리의달인" 로고 옆에 표기할 직책 단어.
//   사장님 요청: 직책에 따라 4종(관리소장 / 경리 / 시설 / 파트너) 표시.
//   본부장·관리인·플랫폼 관리자도 일관성을 위해 짧게 표기, 단 본인 라벨이 없으면 null.
function mobileRoleBadgeLabel(role: Role): string | null {
  switch (role) {
    case "manager": return "관리소장";
    case "accountant": return "경리";
    case "facility_staff": return "시설";
    case "partner": return "파트너";
    case "hq_executive": return "본부장";
    case "custodian": return "관리인";
    case "platform_admin": return "관리자";
    default: return null;
  }
}

// KST 날짜 키 ("YYYY-MM-DD"). 자정 경과 감지 + stale 4/4 방지에만 사용.
function kstDateKey(at?: Date): string {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const base = at ? at.getTime() : Date.now();
  const d = new Date(base + KST_OFFSET_MS);
  return d.toISOString().split("T")[0];
}

function isSubPage(location: string): boolean {
  const parts = location.split("/").filter(Boolean);
  return parts.length > 1;
}

function SidebarContent({ navLinks, user, logout, base, isPartner }: {
  navLinks: React.ReactNode;
  user: any;
  logout: () => void;
  base: string;
  isPartner: boolean;
}) {
  return (
    <>
      <div className="p-4 border-b border-sidebar-border shrink-0">
        <Link href="/"><BrandLogo height={36} className="text-white" /></Link>
      </div>
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">{navLinks}</nav>
      <div className="p-3 border-t border-sidebar-border space-y-2 shrink-0">
        {user && (
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-sm font-medium text-sidebar-foreground truncate">{user.name}</div>
              <div className="text-xs text-sidebar-foreground/50">{ROLE_LABELS[user.role as Role] || user.role}</div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {!isPartner && (
                <Link href="/settings/profile">
                  <button className="p-1.5 text-sidebar-foreground/50 hover:text-white rounded transition-colors" title="설정">
                    <Settings className="w-4 h-4" />
                  </button>
                </Link>
              )}
              <button onClick={logout} className="p-1.5 text-sidebar-foreground/50 hover:text-white rounded transition-colors" title="로그아웃">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        <div className="text-xs text-sidebar-foreground/50">v1.0.0</div>
      </div>
    </>
  );
}

function isAnnouncement(n: Notification): boolean {
  return n.kind === "announcement" || n.notificationType === "platform_announcement";
}

// [Task #609] 일보 작성 독려 알림 클릭 → 해당 일자의 일보 화면으로 직행한다.
//   - "evening" 알림은 그날 본인이 일보를 안 썼다는 안내 → createdAt 의 KST 일자.
//   - "morning" 알림은 어제 일보를 채우라는 안내 → createdAt 의 KST 일자 - 1.
//   relatedEntityId 가 정수라 날짜를 직접 못 담아 알림 type + createdAt 으로 유도.
function pad2(n: number): string { return n < 10 ? `0${n}` : String(n); }
function kstYmdFromIso(iso: string): string {
  const t = new Date(iso).getTime() + 9 * 60 * 60 * 1000;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
function kstAddDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + delta * 24 * 60 * 60 * 1000;
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}
function dailyJournalReminderTargetDate(n: Notification): string | null {
  if (n.notificationType === "daily_journal_reminder_evening") {
    return kstYmdFromIso(String(n.createdAt));
  }
  if (n.notificationType === "daily_journal_reminder_morning") {
    return kstAddDaysYmd(kstYmdFromIso(String(n.createdAt)), -1);
  }
  return null;
}

function NotifBell() {
  const [, setLocation] = useLocation();
  const [notifOpen, setNotifOpen] = useState(false);
  const [openDetail, setOpenDetail] = useState<Notification | null>(null);
  const { data: unreadCount } = useGetUnreadNotificationCount({ query: { staleTime: 30 * 1000, refetchInterval: 60 * 1000 } });
  const { data: notifications } = useListNotifications({ query: { enabled: notifOpen } });
  const { data: campaigns = [] } = useListActiveCampaigns({
    query: { enabled: notifOpen, staleTime: 60_000 },
  });
  const { data: campaignsForBadge = [] } = useListActiveCampaigns({
    query: { staleTime: 60_000, refetchInterval: 5 * 60_000 },
  });
  const markCampaignRead = useMarkCampaignRead();
  const dismissCampaign = useDismissCampaign();
  const recordCampaignImpression = useRecordCampaignImpression();
  // [Task #283] 알림벨 캠페인 노출 추적: 팝오버가 처음 열려서 캠페인이 보일 때
  //   각 캠페인에 대해 세션당 1회 임프레션을 적재한다 (maxImpressionsPerUser 정책 일관성).
  const bellImpressionsRecorded = useRef<Set<number>>(new Set());
  const markRead = useMarkNotificationRead();
  const markAnnouncementRead = useMarkAnnouncementRead();
  const queryClient = useQueryClient();
  const bellCampaigns = useMemo(
    () => campaigns.filter((c) => (c.channels ?? []).includes("bell")),
    [campaigns],
  );
  const unreadCampaignsForBadge = useMemo(
    () => campaignsForBadge.filter((c) => (c.channels ?? []).includes("bell") && !c.isRead).length,
    [campaignsForBadge],
  );

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetUnreadNotificationCountQueryKey() });
  }, [queryClient]);

  // [Task #283] 알림벨이 열리고 캠페인 섹션이 렌더되는 시점에 노출 추적.
  useEffect(() => {
    if (!notifOpen) return;
    if (bellCampaigns.length === 0) return;
    const fresh = bellCampaigns.filter((c) => !bellImpressionsRecorded.current.has(c.id));
    if (fresh.length === 0) return;
    fresh.forEach((c) => bellImpressionsRecorded.current.add(c.id));
    Promise.all(fresh.map((c) => recordCampaignImpression.mutateAsync({ id: c.id }).catch(() => undefined)))
      .then(() => queryClient.invalidateQueries({ queryKey: getListActiveCampaignsQueryKey() }));
  }, [notifOpen, bellCampaigns, recordCampaignImpression, queryClient]);

  const handleMarkRead = useCallback(async (n: Notification) => {
    if (isAnnouncement(n)) {
      await markAnnouncementRead.mutateAsync({ id: n.id });
    } else {
      await markRead.mutateAsync({ id: n.id });
    }
    invalidate();
  }, [markRead, markAnnouncementRead, invalidate]);

  const onItemClick = useCallback(async (n: Notification) => {
    if (isAnnouncement(n)) {
      setOpenDetail(n);
      if (!n.isRead) {
        await markAnnouncementRead.mutateAsync({ id: n.id });
        invalidate();
      }
      setNotifOpen(false);
      return;
    }
    if (!n.isRead) await handleMarkRead(n);
    // [Task #609] 일보 작성 독려 알림 클릭 → 해당 일자의 일보 화면으로 이동.
    const targetYmd = dailyJournalReminderTargetDate(n);
    if (targetYmd) {
      setNotifOpen(false);
      setLocation(`/work-log?tab=daily&date=${targetYmd}`);
    }
  }, [handleMarkRead, markAnnouncementRead, invalidate, setLocation]);

  return (
    <>
      <Popover open={notifOpen} onOpenChange={setNotifOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="relative min-w-[44px] min-h-[44px]">
            <Bell className="w-5 h-5" />
            {((unreadCount?.count ?? 0) + unreadCampaignsForBadge) > 0 && (
              <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {(unreadCount?.count ?? 0) + unreadCampaignsForBadge}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <div className="p-3 border-b">
            <div className="font-medium text-sm">알림</div>
          </div>
          <ScrollArea className="max-h-80">
            {bellCampaigns.length > 0 && (
              <div className="border-b" data-testid="bell-campaign-section">
                <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-blue-700 bg-blue-50/40">
                  이벤트 · 캠페인
                </div>
                <div className="divide-y">
                  {bellCampaigns.map((c) => (
                    <div
                      key={`camp-${c.id}`}
                      className={cn(
                        "p-3 text-sm cursor-pointer hover:bg-muted/50 transition-colors min-h-[44px]",
                        !c.isRead && "bg-blue-50/40",
                      )}
                      onClick={async () => {
                        if (!c.isRead) {
                          try {
                            await markCampaignRead.mutateAsync({ id: c.id });
                            queryClient.invalidateQueries({ queryKey: getListActiveCampaignsQueryKey() });
                          } catch {
                            /* tolerate */
                          }
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Badge variant="secondary" className="shrink-0 gap-1 bg-blue-100 text-blue-700 hover:bg-blue-100">
                            <Megaphone className="w-3 h-3" />
                            캠페인
                          </Badge>
                          <p className="font-medium text-sm truncate">{c.title}</p>
                        </div>
                        {!c.isRead && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                      </div>
                      {/* [Task #283] 본문은 마크다운 리치텍스트로 렌더. */}
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2 prose prose-xs max-w-none">
                        <ReactMarkdown>{c.body}</ReactMarkdown>
                      </div>
                      {c.type !== "required" && (
                        <div className="mt-1.5 flex justify-end">
                          <button
                            type="button"
                            className="text-[11px] text-slate-500 hover:text-slate-700 underline-offset-2 hover:underline"
                            data-testid={`bell-campaign-dismiss-${c.id}`}
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                await dismissCampaign.mutateAsync({ id: c.id, data: { mode: "forever" } });
                                queryClient.invalidateQueries({ queryKey: getListActiveCampaignsQueryKey() });
                              } catch {
                                /* tolerate */
                              }
                            }}
                          >
                            다시 보지 않기
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {notifications && notifications.length > 0 ? (
              <div className="divide-y">
                {notifications.map((n) => {
                  const ann = isAnnouncement(n);
                  return (
                    <div
                      key={`${ann ? "ann" : "sys"}-${n.id}`}
                      className={cn(
                        "p-3 text-sm cursor-pointer hover:bg-muted/50 transition-colors min-h-[44px]",
                        !n.isRead && "bg-primary/5",
                      )}
                      onClick={() => onItemClick(n)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {ann && (
                            <Badge
                              variant="secondary"
                              className="shrink-0 gap-1 bg-blue-100 text-blue-700 hover:bg-blue-100"
                            >
                              <Megaphone className="w-3 h-3" />
                              공지
                            </Badge>
                          )}
                          <p className="font-medium text-sm truncate">{n.title}</p>
                        </div>
                        {!n.isRead && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 whitespace-pre-line">{n.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString("ko-KR")}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">알림이 없습니다</div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <Dialog open={openDetail !== null} onOpenChange={(open) => !open && setOpenDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-blue-600" />
              <span>{openDetail?.title}</span>
            </DialogTitle>
            {openDetail && (
              <DialogDescription className="text-xs">
                {new Date(openDetail.createdAt).toLocaleString("ko-KR")}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="text-sm whitespace-pre-line max-h-[60vh] overflow-y-auto">
            {openDetail?.message}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const base = import.meta.env.BASE_URL ?? "/";
  const [drawerOpen, setDrawerOpen] = useState(false);
  // [사이드바 접기/펼치기] 큰 메뉴 헤더를 누르면 그 그룹의 작은 메뉴들이 접힘.
  // 상태는 localStorage 에 저장해 새로고침/페이지 이동 후에도 유지.
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem("sidebar-collapsed");
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch { return new Set(); }
  });
  const toggleSection = useCallback((title: string) => {
    if (!title) return;
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title); else next.add(title);
      try { window.localStorage.setItem("sidebar-collapsed", JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);
  // [네비 정비] 업무기록(QuickEntry) 다이얼로그 — 하단 네비 가운데 + 버튼이 토글.
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => { setDrawerOpen(false); }, [location]);

  const effectiveRole = getEffectiveRole(user);

  // [Task #270] 시니어 사용자(관리소장) 모바일 폰트 확대 스코프 마커.
  // index.css 의 @media (max-width: 899px) 오버라이드가 body[data-role="manager"]
  // 일 때만 활성화되도록 역할별 마커를 body 에 부여한다. 다른 역할 모드(본사·
  // 경리·시설기사·파트너)에서는 폰트가 그대로 유지된다.
  useEffect(() => {
    const prev = document.body.dataset.role;
    document.body.dataset.role = effectiveRole;
    return () => {
      if (prev === undefined) {
        delete document.body.dataset.role;
      } else {
        document.body.dataset.role = prev;
      }
    };
  }, [effectiveRole]);

  const isPartner = effectiveRole === "partner";
  // [카테고리 메뉴 제어] 플랫폼이 끈 카테고리는 사이드바·하단 네비에서 모두 숨김.
  const disabledCategories = user?.disabledCategories ?? [];
  const disabledKey = disabledCategories.join(",");
  // [플랫폼 메뉴 정비] 역할×메뉴 활성화 그리드 결과를 1분 캐시로 가져와
  //   사이드바·하단 네비 필터에 동일하게 적용.
  const menuOverrides = useMenuOverrides(!!user);
  const overridesKey = useMemo(
    () => menuOverrides.map((o) => `${o.role}:${o.blockId}:${o.enabled ? 1 : 0}`).join("|"),
    [menuOverrides],
  );
  const sections = useMemo(
    () => getSidebarSections(effectiveRole, disabledCategories, menuOverrides),
    [effectiveRole, disabledKey, overridesKey],
  );
  const bottomItems = useMemo(
    () => getBottomNavItems(effectiveRole, disabledCategories, menuOverrides),
    [effectiveRole, disabledKey, overridesKey],
  );

  // 시설 그룹 신호등 배지: 1분 폴링 + 창 포커스 갱신.
  // 시설 섹션이 노출되는 role에만 활성화하여 불필요한 호출을 막는다.
  const hasFacilitySection = useMemo(
    () => sections.some((s) => s.title === "시설관리"),
    [sections],
  );
  const { data: facilityStatus, dataUpdatedAt: facilityStatusUpdatedAt } =
    useGetFacilityStatusSummary({
      query: {
        queryKey: ["facility-status-summary"],
        enabled: hasFacilitySection,
        refetchInterval: 60 * 1000,
        refetchOnWindowFocus: true,
        staleTime: 30 * 1000,
      },
    });
  // 시설 그룹 헤더 우측 N/4 진행률 배지.
  // 자정 리셋: 클라이언트 KST 날짜가 바뀌면 (1) 즉시 stale 데이터를 숨기고
  // (2) 서버에서 최신값을 다시 받아오도록 쿼리를 invalidate.
  const [todayKey, setTodayKey] = useState(() => kstDateKey());
  useEffect(() => {
    const tick = () => {
      const k = kstDateKey();
      setTodayKey((prev) => (prev === k ? prev : k));
    };
    const id = window.setInterval(tick, 60 * 1000);
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  // 데이터가 도착한 시점의 KST 날짜를 추적해, 자정 경과 후
  // 새 데이터가 오기 전까지 이전 날짜의 4/4가 보이는 것을 차단.
  const fetchedKstKey = useMemo(
    () => (facilityStatusUpdatedAt ? kstDateKey(new Date(facilityStatusUpdatedAt)) : null),
    [facilityStatusUpdatedAt],
  );
  useEffect(() => {
    if (!hasFacilitySection) return;
    if (fetchedKstKey && fetchedKstKey !== todayKey) {
      void queryClient.invalidateQueries({ queryKey: ["facility-status-summary"] });
    }
  }, [todayKey, fetchedKstKey, hasFacilitySection, queryClient]);
  const isProgressFresh = fetchedKstKey !== null && fetchedKstKey === todayKey;
  const todayProgress =
    isProgressFresh &&
    facilityStatus &&
    (facilityStatus as FacilityStatusSummary).todayProgress
      ? (facilityStatus as FacilityStatusSummary).todayProgress!
      : null;
  const showTodayProgress = hasFacilitySection && todayProgress !== null;
  const isFullyDone =
    showTodayProgress && todayProgress!.completedCount >= todayProgress!.totalCount;

  const badgeForPath = useCallback(
    (path: string): FacilityBadge | undefined => {
      if (!facilityStatus) return undefined;
      const s = facilityStatus as FacilityStatusSummary;
      switch (path) {
        case "/inspections":
          return s.inspections;
        case "/safety-checklists":
          return s.safetyChecklists;
        case "/maintenance-logs":
          return s.maintenanceLogs;
        case "/safety-training":
          return s.safetyTrainings;
        default:
          return undefined;
      }
    },
    [facilityStatus],
  );

  const bottomNavItems = bottomItems;
  const showBack = isSubPage(location);

  const navLinks = useMemo(() => sections.map((section, si) => {
    // 시설 및 안전관리 그룹은 4-아이콘 그리드로 렌더 (시니어 친화적 인지 속도 향상).
    // 그룹 헤더는 role이 /facility 접근 권한이 있을 때만 클릭 가능 (headerHref 사용).
    const isFacilityGrid =
      section.title === "시설관리" && section.items.length > 0;

    if (isFacilityGrid) {
      // [요청] 사이드바 그룹 헤더의 N/4 진행률 텍스트 제거.
      const header = (
        <div
          className={cn(
            "px-3 pt-4 pb-1 flex items-center gap-2 text-[10px] uppercase tracking-wider font-semibold transition-colors",
            section.headerHref
              ? "text-sidebar-foreground/40 cursor-pointer hover:text-sidebar-foreground/70"
              : "text-sidebar-foreground/40",
          )}
        >
          <span className="truncate">{section.title}</span>
        </div>
      );
      // [종배치] 시설 그룹도 다른 그룹과 동일한 세로 리스트로 렌더하되,
      // 그룹 헤더의 진행률 배지와 항목별 신호등 배지는 유지한다.
      return (
        <div key={si}>
          {section.headerHref ? <Link href={section.headerHref}>{header}</Link> : header}
          {section.items.map((item) => {
            const navHref = navItemHref(item);
            const isActive = isNavItemActive(item, location);
            const badge = badgeForPath(item.path);
            return (
              <Link key={navHref} href={navHref}>
                <div
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer min-h-[44px]",
                    isActive
                      ? "bg-sidebar-accent text-white"
                      : "text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent/50"
                  )}
                  title={badge?.ariaLabel ?? item.label}
                >
                  <span className="relative inline-flex">
                    <item.icon className="w-4 h-4 shrink-0" />
                    <FacilityStatusBadge badge={badge} size="sm" />
                  </span>
                  <span className="truncate">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      );
    }

    const sectionTitle = section.title ?? "";
    const isCollapsible = !!sectionTitle;
    const isCollapsed = isCollapsible && collapsedSections.has(sectionTitle);
    return (
      <div key={si}>
        {section.title && (
          <button
            type="button"
            onClick={() => toggleSection(sectionTitle)}
            className="w-full flex items-center justify-between gap-1 px-3 pt-4 pb-1 text-[10px] uppercase tracking-wider text-sidebar-foreground/40 font-semibold hover:text-sidebar-foreground/70 transition-colors"
            aria-expanded={!isCollapsed}
          >
            <span className="truncate">{section.title}</span>
            {isCollapsed
              ? <ChevronRight className="w-3 h-3 shrink-0" />
              : <ChevronDown className="w-3 h-3 shrink-0" />}
          </button>
        )}
        {!isCollapsed && section.items.map((item) => {
          const navHref = navItemHref(item);
          const isActive = isNavItemActive(item, location);
          return (
            <Link key={navHref} href={navHref}>
              <div
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer min-h-[44px]",
                  isActive
                    ? "bg-sidebar-accent text-white"
                    : "text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent/50"
                )}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
    );
  }), [location, isPartner, sections, badgeForPath, showTodayProgress, todayProgress, isFullyDone, collapsedSections, toggleSection]);

  // [Task #405] 온보딩 풀스크린 위저드(/onboarding/manager, /onboarding/role-select,
  //   /onboarding/units-master, /onboarding/facility-staff 등)는 자체 Shell 을 사용한다.
  //   상단 모바일 헤더, 좌측 사이드바, 하단 BottomTab 이 위저드 위에 그려져
  //   hero(시작하기) 영역을 가리는 회귀를 막기 위해, onboarding 하위 경로에서는
  //   chrome 을 일체 렌더하지 않고 children 만 그대로 반환한다.
  //   [Task #559] 슬래시 포함 prefix 로 좁힌다.  `/onboarding` (정확 매치)는
  //   진행 상황 카드 + BuildingSetup 폼을 보여주는 정상 페이지라 사이드바·헤더가
  //   필요하다. 이전 `startsWith("/onboarding")` 매치는 게이트 통과 후 lavian 사장님
  //   계정이 `/onboarding` 에 머문 상태에서 사이드바가 사라져 잠긴 듯한 회귀를 만들었다.
  //   useAuth/useEffect/useMemo 등 모든 hook 호출 이후에 분기하므로 hook 순서는 유지된다.
  if (location.startsWith("/onboarding/")) {
    return <>{children}</>;
  }

  return (
    <>
      <style>{`
        .layout-grid {
          display: flex;
          flex-direction: column;
          width: 100%;
          min-height: 100vh;
        }
        .layout-column {
          display: flex;
          flex-direction: column;
          min-width: 0;
          min-height: 100vh;
        }
        .layout-sidebar { display: none; }
        .layout-mobile-header { display: flex; }
        .layout-desktop-header { display: none; }
        .layout-bottom-nav { display: flex; }
        .layout-desktop-fab { display: none; }
        .layout-content-area { padding-bottom: calc(60px + env(safe-area-inset-bottom, 0px)); }

        /* [Task #327] 6 역할 대시보드 모바일/데스크탑 분기용 헬퍼 클래스.
           모바일은 ≤899px (layout 의 다른 분기와 동일 breakpoint),
           데스크탑은 ≥900px. JS viewport 측정 없이 CSS-only.
           [Task #559] hover/pointer 조건 추가 — Chrome "데스크톱 사이트" 모드를 켜도
           폰의 터치 입력 특성(hover:none, pointer:coarse) 은 변하지 않으므로
           모바일 디바이스에서는 항상 모바일 layout 이 유지된다. */
        .dash-mobile-only { display: none; }
        .dash-desktop-only { display: block; }

        @media (max-width: 899px), (hover: none), (pointer: coarse) {
          /* [Task #모바일 앱화] 모바일에서는 헤더+컨텐츠+하단네비 가 한 화면에 고정.
             컨텐츠가 짧으면 스크롤이 전혀 발생하지 않고, 길면 컨텐츠 영역 안에서만 스크롤된다. */
          .layout-grid {
            max-width: 100vw;
            overflow: hidden;
            height: calc(100dvh - 60px - env(safe-area-inset-bottom, 0px));
            min-height: 0;
          }
          .layout-column {
            height: 100%;
            min-height: 0;
            flex: 1 1 auto;
          }
          .layout-content-area {
            flex: 1 1 0;
            min-height: 0;
            overflow-y: auto;
            overflow-x: hidden;
            padding-bottom: 0;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior: contain;
          }
          .dash-mobile-only { display: block; }
          .dash-desktop-only { display: none; }
        }

        @media (min-width: 900px) and (hover: hover) and (pointer: fine) {
          .layout-grid {
            display: block;
            padding-left: 220px;
          }
          .layout-sidebar {
            display: flex;
            position: fixed;
            top: 0;
            left: 0;
            width: 220px;
            height: 100vh;
            overflow: hidden;
            z-index: 30;
          }
          .layout-mobile-header { display: none; }
          .layout-desktop-header { display: flex; }
          .layout-bottom-nav { display: none; }
          .layout-desktop-fab { display: inline-flex; }
          .layout-content-area { padding-bottom: 0; }
        }
      `}</style>

      {drawerOpen && (
        <div
          className="fixed top-0 left-0 right-0 z-20 bg-background flex flex-col"
          style={{
            paddingTop: "env(safe-area-inset-top, 0px)",
            bottom: "calc(60px + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <Link href="/" onClick={() => setDrawerOpen(false)}>
              <BrandLogo height={32} />
            </Link>
            <button
              onClick={() => setDrawerOpen(false)}
              className="p-2 rounded hover:bg-muted min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4">
            {sections.map((section, si) => {
              const isFacility = section.title === "시설관리" && section.items.length > 0;
              // [요청] 모바일 드로어 그룹 헤더의 N/4 진행률 텍스트 제거.
              const drawerProgressPill = isFacility && false ? (
                <span
                  aria-label={`오늘 4대 핵심 과업 ${todayProgress!.completedCount}/${todayProgress!.totalCount} 완료`}
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                    isFullyDone
                      ? "bg-emerald-500/15 text-emerald-700"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {isFullyDone && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                  <span>{todayProgress!.completedCount}/{todayProgress!.totalCount}</span>
                </span>
              ) : null;
              const drawerSectionTitle = section.title ?? "";
              const drawerCollapsible = !!drawerSectionTitle && !section.headerHref;
              const drawerCollapsed = drawerCollapsible && collapsedSections.has(drawerSectionTitle);
              const headerInner = (
                <div className="flex items-center justify-between gap-2 pb-2">
                  <span className="px-1 text-xs font-semibold text-muted-foreground truncate">
                    {section.title}
                  </span>
                  {drawerCollapsible
                    ? (drawerCollapsed
                        ? <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        : <ChevronDown className="w-4 h-4 text-muted-foreground" />)
                    : drawerProgressPill}
                </div>
              );
              return (
              <div key={si} className="mb-6">
                {section.title && (
                  section.headerHref ? (
                    <Link href={section.headerHref} onClick={() => setDrawerOpen(false)}>
                      <div className="cursor-pointer hover:text-foreground transition-colors">
                        {headerInner}
                      </div>
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleSection(drawerSectionTitle)}
                      className="w-full text-left cursor-pointer hover:text-foreground transition-colors"
                      aria-expanded={!drawerCollapsed}
                    >
                      {headerInner}
                    </button>
                  )
                )}
                {/* [종배치] 모바일 드로어도 세로 리스트로 통일 */}
                {!drawerCollapsed && <div className="flex flex-col gap-1">
                  {section.items.map((item) => {
                    const navHref = navItemHref(item);
                    const isActive = isNavItemActive(item, location);
                    const badge = badgeForPath(item.path);
                    // [Task #256] 드로어 항목 아이콘에도 카테고리 색을 적용 — 같은
                    // 카테고리는 어느 화면(드로어/하단 네비/카드)에서도 동일 색.
                    const drawerCatToken = item.group ? GROUP_TO_CATEGORY[item.group] : "system";
                    const drawerIconColor = CATEGORY_ICON_CLASS[drawerCatToken];
                    return (
                      <Link key={navHref} href={navHref}>
                        <button
                          onClick={() => setDrawerOpen(false)}
                          aria-label={badge?.ariaLabel ?? item.label}
                          className={cn(
                            "w-full min-w-0 flex items-center gap-2.5 py-3 px-3 rounded-lg border transition-colors text-left",
                            isActive
                              ? "bg-accent/10 border-accent text-accent"
                              : "bg-card border-border hover:bg-muted text-foreground"
                          )}
                        >
                          <span className="relative inline-flex">
                            <item.icon className={cn("w-5 h-5 shrink-0", !isActive && drawerIconColor)} />
                            <FacilityStatusBadge badge={badge} size="md" />
                          </span>
                          <span className="text-sm font-medium truncate">
                            {item.label}
                          </span>
                        </button>
                      </Link>
                    );
                  })}
                </div>}
              </div>
              );
            })}
          </div>

          {/* 모바일 드로어 하단의 사용자/설정/로그아웃 바는 제거됨.
              설정 진입은 메뉴 항목, 로그아웃은 설정 화면 최하단으로 이동. */}
        </div>
      )}

      <div className="layout-grid">
        <aside className="layout-sidebar bg-sidebar text-sidebar-foreground flex-col">
          <SidebarContent navLinks={navLinks} user={user} logout={logout} base={base} isPartner={isPartner} />
        </aside>

        <div className="layout-column">
          <div className="layout-mobile-header sticky top-0 z-20 bg-background border-b px-2 py-2 items-center justify-between">
            <div className="flex items-center gap-1 min-w-0">
              {showBack ? (
                <button
                  onClick={() => {
                    const parts = location.split("/").filter(Boolean);
                    setLocation("/" + parts.slice(0, -1).join("/"));
                  }}
                  className="p-2 rounded hover:bg-muted min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              ) : (
                <div className="w-2" />
              )}
              <Link href="/" className="flex items-center gap-1.5 shrink-0">
                <BrandLogo height={28} />
                {/* [모바일 헤더 직책 라벨] 로고 옆에 같은 폰트사이즈로 직책을 표기.
                    BrandLogo 워드마크(viewBox 64, fontSize 30) 가 height=28 일 때
                    실제 글자 높이 ≈ 13px 이므로 text-sm(14px) 가 시각적으로 일치.
                    색은 약간 옅은 violet-500 으로 구분, 굵기는 동일(extrabold). */}
                {(() => {
                  const label = mobileRoleBadgeLabel(effectiveRole);
                  if (!label) return null;
                  return (
                    <span
                      className="text-sm font-extrabold tracking-tight text-violet-500 leading-none"
                      data-testid="mobile-header-role-label"
                    >
                      {label}
                    </span>
                  );
                })()}
              </Link>
            </div>
            <NotifBell />
          </div>

          <div className="layout-desktop-header sticky top-0 z-20 bg-background border-b px-6 py-3 justify-end">
            <NotifBell />
          </div>

          <div className="layout-content-area flex-1 p-3 sm:p-6 max-w-[1400px] w-full mx-auto">{children}</div>
          {/* [파트너 푸터 모바일 숨김] 사장님 요청: 모바일에서 (주)관리의달인 회사정보
              푸터를 숨기고 데스크톱에서만 노출. dash-desktop-only 헬퍼 클래스가
              ≥900px(+ pointer:fine) 에서만 block 으로 보이게 처리한다. */}
          {isPartner && (
            <div className="dash-desktop-only" data-testid="partner-platform-footer-wrap">
              <PlatformFooter />
            </div>
          )}
        </div>
      </div>

      {/* [네비 정비] 모바일은 하단 네비 가운데 + 버튼이 업무기록 다이얼로그를 띄운다.
          데스크톱(≥900px) 은 하단 네비가 숨겨지므로, 같은 기능을 우하단 플로팅
          배너 버튼(layout-desktop-fab) 으로 노출한다. 역할에 업무기록 항목이 없으면
          렌더링하지 않는다(파트너 등). */}
      <CampaignModalHost />
      <QuickEntryDialog
        open={quickEntryOpen}
        onOpenChange={setQuickEntryOpen}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["work-logs"] })}
      />
      {(() => {
        const quickEntryItem = bottomNavItems.find((it) => it.path === "/__quick_entry");
        if (!quickEntryItem) return null;
        const Icon = quickEntryItem.icon;
        return (
          <button
            type="button"
            onClick={() => setQuickEntryOpen(true)}
            data-testid="desktop-fab-quick-entry"
            aria-label="업무기록"
            className="layout-desktop-fab fixed right-6 bottom-6 z-40 flex-col items-center justify-center gap-0.5 rounded-2xl bg-primary text-primary-foreground shadow-xl hover:opacity-95 active:scale-95 transition px-4 py-3"
          >
            <Icon className="w-7 h-7" />
            <span className="text-xs font-semibold leading-tight mt-0.5">업무기록</span>
          </button>
        );
      })()}

      <nav className="layout-bottom-nav fixed bottom-0 left-0 right-0 z-30 bg-background border-t items-center justify-around"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)", height: "calc(60px + env(safe-area-inset-bottom, 0px))" }}
        >
          {bottomNavItems.map((item) => {
            // [네비 정비] 업무기록 sentinel — 라우팅이 아닌 다이얼로그 트리거.
            if (item.path === "/__quick_entry") {
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    setQuickEntryOpen(true);
                  }}
                  data-testid="bottom-nav-quick-entry"
                  aria-label="업무기록"
                  className="flex flex-col items-center justify-center gap-0.5 min-w-[64px] min-h-[48px] py-1.5 px-2 rounded-lg transition-colors text-muted-foreground"
                >
                  <span className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md active:scale-95 transition">
                    <item.icon className="w-5 h-5" />
                  </span>
                  <span className="text-[10px] font-medium">{item.label}</span>
                </button>
              );
            }
            // [Task #290] 사이드바와 동일하게 query 까지 포함한 href·active 판정 사용.
            //   같은 path 가 다른 tab 으로 두 번 등장할 수 있으므로 key 도 path+query 로 구성.
            const navHref = navItemHref(item);
            const isActive = isNavItemActive(item, location);
            const navKey = item.query
              ? `${item.path}?${new URLSearchParams(item.query).toString()}`
              : item.path;
            // 하단 네비게이션은 무색(중립) 처리 — 활성 탭만 foreground 로 강조.
            return (
              <Link key={navKey} href={navHref}>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 min-w-[64px] min-h-[48px] py-1.5 px-2 rounded-lg transition-colors",
                    isActive ? "font-semibold text-foreground" : "text-muted-foreground"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">
                    {item.label}
                  </span>
                </button>
              </Link>
            );
          })}
          <button
            onClick={() => setDrawerOpen(true)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 min-w-[64px] min-h-[48px] py-1.5 px-2 rounded-lg transition-colors text-muted-foreground"
            )}
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px] font-medium">더보기</span>
          </button>
        </nav>
    </>
  );
}
