import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { NotebookPen } from "lucide-react";
import {
  useApi, todayISO, readInitialTab, readInitialOpenDaily,
  type DailyJournal, type WorkLogTab,
} from "./shared";
import { TimelineTab } from "./timeline-tab";
import { DailyTab, DailyJournalWizard } from "./daily-tab";
import { WeeklyTab } from "./weekly-tab";
import { MonthlyTab } from "./monthly-tab";
import { ActivityTab } from "./activity-tab";

export default function WorkLogPage() {
  const [tab, setTab] = useState<WorkLogTab>(readInitialTab);
  const [autoOpenDailyWizard, setAutoOpenDailyWizard] = useState(false);
  // [개선] 페이지 상단에서 "오늘 일지" 작성 모달을 직접 띄운다. 어떤 탭에 있든
  //   모달은 그대로 노출되고, 저장 시 탭만 daily 로 전환한다.
  const [todayWizardOpen, setTodayWizardOpen] = useState<boolean>(readInitialOpenDaily);
  const today = useMemo(() => todayISO(), []);
  const { call } = useApi();
  // 오늘자 일지(있으면 form 의 기본값으로 사용)를 가볍게 미리 가져온다.
  const todayJournalQ = useQuery({
    queryKey: ["work-log-today-journal", today],
    queryFn: () => call<DailyJournal | null>(`/daily-journals/${today}`).catch(() => null),
    staleTime: 30 * 1000,
  });

  // [Task #250] URL 의 ?tab= 변경(processing 내역에서 일지로 점프 등)에 반응해 탭을 재동기화한다.
  useEffect(() => {
    const sync = () => {
      setTab(readInitialTab());
      if (readInitialOpenDaily()) setTodayWizardOpen(true);
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  // 모달이 닫히면 URL 의 openDaily 플래그를 제거해 새로고침 시 다시 열리지 않도록 한다.
  useEffect(() => {
    if (todayWizardOpen) return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("openDaily")) {
      url.searchParams.delete("openDaily");
      window.history.replaceState({}, "", url.toString());
    }
  }, [todayWizardOpen]);

  // 탭 전환 시 URL 도 함께 업데이트해 새로고침/북마크 시 동일 탭으로 복귀.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") !== tab) {
      url.searchParams.set("tab", tab);
      window.history.replaceState({}, "", url.toString());
    }
  }, [tab]);

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <NotebookPen className="w-5 h-5 text-accent" />
        <h1 className="text-xl font-bold">업무일지</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        평소엔 가볍게 메모만, 보고할 땐 자동으로 일·주·월 일지가 만들어집니다.
      </p>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        {/* [Task #256] 탭 라벨/순서 정비.
            data-testid 와 value 는 라우팅·딥링크 호환을 위해 기존 키(timeline·daily·
            weekly·monthly·activity)를 그대로 유지하되, 사용자에게 보이는 라벨만 바꾼다.
            순서: 금일기록(=timeline) → 일보 → 주보(자동) → 월보(자동) → 모든기록(=activity).
        */}
        {/* [Hotfix] 좁은 모바일 폭에서도 5개 탭이 동일한 가로 폭/높이로
            보이도록 h-auto + 균일한 padding/text-size 를 강제한다.
            기존 h-9 고정 + 활성 탭의 shadow 결합이 "선택된 탭만 커 보이는"
            착시를 유발했음. */}
        <TabsList className="grid grid-cols-5 w-full h-auto p-1 gap-1">
          <TabsTrigger value="timeline" data-testid="tab-timeline" className="text-[11px] px-1 py-1.5 h-8">금일기록</TabsTrigger>
          <TabsTrigger value="daily" data-testid="tab-daily" className="text-[11px] px-1 py-1.5 h-8">일보</TabsTrigger>
          <TabsTrigger value="weekly" data-testid="tab-weekly" className="text-[11px] px-1 py-1.5 h-8">주보(자동)</TabsTrigger>
          <TabsTrigger value="monthly" data-testid="tab-monthly" className="text-[11px] px-1 py-1.5 h-8">월보(자동)</TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity" className="text-[11px] px-1 py-1.5 h-8">모든기록</TabsTrigger>
        </TabsList>
        <TabsContent value="timeline">
          <TimelineTab onGoDaily={() => setTodayWizardOpen(true)} />
        </TabsContent>
        <TabsContent value="daily">
          <DailyTab
            autoOpenWizard={autoOpenDailyWizard}
            onAutoOpenConsumed={() => setAutoOpenDailyWizard(false)}
          />
        </TabsContent>
        <TabsContent value="weekly"><WeeklyTab /></TabsContent>
        <TabsContent value="monthly"><MonthlyTab /></TabsContent>
        <TabsContent value="activity"><ActivityTab /></TabsContent>
      </Tabs>

      {/* [개선] 모달은 페이지 최상위에서 렌더 — 어떤 탭에서 호출되어도 동일하게 노출. */}
      {todayWizardOpen && (
        <DailyJournalWizard
          date={today}
          existing={todayJournalQ.data ?? null}
          onClose={() => setTodayWizardOpen(false)}
          onSaved={() => {
            setTodayWizardOpen(false);
            todayJournalQ.refetch();
            setTab("daily");
          }}
        />
      )}
    </div>
  );
}
