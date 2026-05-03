// [Task: 관리비 자동부과 v01]
// 한큐 위저드 — 부과 한 사이클(11단계)을 위→아래 카드로 보여주고
// 단계별 "지금 하기" 링크로 해당 페이지로 보낸다. 단계 완료 체크는
// localStorage("billing-wizard-progress:<yyyy-mm>") 에 저장해 새로고침/
// 재로그인 후에도 유지된다. v01 은 진행률 표시 + 다음 단계 자동 강조까지.
//
// 단계 자동전이의 "자동": 사용자가 해당 단계 페이지에서 작업을 마치고
// 위저드로 돌아오면, 직전 단계를 자동으로 완료 표시 + 다음 단계 카드를
// 강조한다. (단계 검증의 server-side 자동화는 v02 에서 부과월 phase 와
// 결합 예정.)

import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Calendar, ListChecks, Sparkles, PlusCircle, Calculator, BarChart3,
  Edit3, Send, CreditCard, MailCheck, Lock, ArrowRight, Check,
  CheckCircle2, Circle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Step = {
  key: string;
  no: number;
  label: string;
  desc: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
};

const STEPS: Step[] = [
  { key: "months",        no:  1, label: "부과월 열기",      desc: "이번 달 부과 사이클을 만들거나 이어서 진행합니다.", path: "/billing/months",          icon: Calendar },
  { key: "items",         no:  2, label: "부과항목 확인",    desc: "관리비·검침 등 항목 단가/기준이 올바른지 확인합니다.", path: "/billing/items",           icon: ListChecks },
  { key: "late-fee",      no:  3, label: "연체율 정책",      desc: "이달 적용할 연체 이율과 누진 구간을 점검합니다.",   path: "/billing/late-fee-rates",  icon: Sparkles },
  { key: "extra-charges", no:  4, label: "별도 부과 등록",   desc: "호실별 일회성 부과(보수비 등)를 등록합니다.",       path: "/billing/extra-charges",   icon: PlusCircle },
  { key: "run",           no:  5, label: "부과 실행",        desc: "공통경비를 입력해 호실별 금액을 자동 산출합니다.",  path: "/billing/run",             icon: Calculator },
  { key: "summary",       no:  6, label: "총괄표 검토",      desc: "전월 대비 증감과 카테고리 합계를 확인합니다.",      path: "/billing/summary",         icon: BarChart3 },
  { key: "adjustments",   no:  7, label: "조정 처리",        desc: "할인·환불·재부과 등 예외 건을 반영합니다.",         path: "/billing/adjustments",     icon: Edit3 },
  { key: "notices",       no:  8, label: "고지서 발행",      desc: "PDF 고지서를 일괄 생성하고 발송 채널을 정합니다.", path: "/billing/notices",         icon: Send },
  { key: "auto-debit",    no:  9, label: "자동이체 의뢰",    desc: "은행별 CMS 의뢰서를 만들어 출금을 의뢰합니다.",     path: "/billing/auto-debit",      icon: CreditCard },
  { key: "delivery",      no: 10, label: "발송 확인",        desc: "이메일·SMS·카카오 도달과 실패 건을 확인·재발송합니다.", path: "/billing/notice-delivery", icon: MailCheck },
  { key: "close",         no: 11, label: "부과 마감",        desc: "이달 부과를 잠그고 다음 달로 넘어갑니다.",          path: "/billing/close",           icon: Lock },
];

function thisMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function storageKey(month: string) {
  return `billing-wizard-progress:${month}`;
}

function loadProgress(month: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey(month));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { return new Set(); }
}

function saveProgress(month: string, done: Set<string>) {
  try { window.localStorage.setItem(storageKey(month), JSON.stringify([...done])); } catch {}
}

export default function BillingWizardPage() {
  const [, setLocation] = useLocation();
  const [month, setMonth] = useState(thisMonthKey);
  const [done, setDone] = useState<Set<string>>(() => loadProgress(thisMonthKey()));
  // [자동전이] 위저드를 떠난 단계의 path 를 기억했다가, 위저드로 돌아오면
  //   해당 단계를 완료로 마킹한다. v01 은 사용자 작업 완료 여부를 신뢰.
  const [pendingComplete, setPendingComplete] = useState<string | null>(null);

  useEffect(() => { setDone(loadProgress(month)); }, [month]);

  useEffect(() => {
    if (!pendingComplete) return;
    setDone((prev) => {
      if (prev.has(pendingComplete)) return prev;
      const next = new Set(prev);
      next.add(pendingComplete);
      saveProgress(month, next);
      return next;
    });
    setPendingComplete(null);
  }, [pendingComplete, month]);

  const completedCount = useMemo(() =>
    STEPS.reduce((n, s) => n + (done.has(s.key) ? 1 : 0), 0)
  , [done]);
  const totalCount = STEPS.length;
  const percent = Math.round((completedCount / totalCount) * 100);
  const currentIdx = useMemo(() => {
    const idx = STEPS.findIndex((s) => !done.has(s.key));
    return idx === -1 ? STEPS.length - 1 : idx;
  }, [done]);
  const isAllDone = completedCount === totalCount;

  const toggle = (key: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      saveProgress(month, next);
      return next;
    });
  };

  const goStep = (s: Step) => {
    setPendingComplete(s.key);
    setLocation(s.path);
  };

  const resetAll = () => {
    if (!window.confirm(`${month} 부과 진행 상황을 모두 초기화할까요?`)) return;
    setDone(new Set());
    saveProgress(month, new Set());
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" />
          관리비 자동부과 한큐 위저드
        </h1>
        <p className="text-sm text-muted-foreground">
          부과 한 사이클을 위에서 아래로 따라가기만 하면 끝납니다.
          각 단계에서 "지금 하기"를 누르면 해당 화면으로 이동하고, 돌아오면 자동으로 완료 처리됩니다.
        </p>
      </div>

      {/* 진행 요약 카드 */}
      <Card className="mb-6">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value || thisMonthKey())}
                className="border rounded-md px-3 py-2 text-sm"
                aria-label="부과월 선택"
              />
              <span className="text-sm text-muted-foreground">
                {completedCount} / {totalCount} 단계 완료 ({percent}%)
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={resetAll}>
              진행 초기화
            </Button>
          </div>
          <div
            className="w-full bg-muted rounded-full h-2 overflow-hidden"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={cn("h-full transition-all",
                isAllDone ? "bg-emerald-500" : "bg-primary")}
              style={{ width: `${percent}%` }}
            />
          </div>
          {isAllDone && (
            <div className="mt-3 flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              이번 달 부과를 모두 마쳤습니다. 수고하셨습니다!
            </div>
          )}
        </CardContent>
      </Card>

      {/* 단계 카드 목록 */}
      <ol className="space-y-3">
        {STEPS.map((s, idx) => {
          const isDone = done.has(s.key);
          const isCurrent = !isDone && idx === currentIdx;
          const Icon = s.icon;
          return (
            <li key={s.key}>
              <Card
                className={cn("transition-all",
                  isCurrent && "ring-2 ring-primary shadow-md",
                  isDone && "opacity-70")}
              >
                <CardContent className="p-4 sm:p-5 flex items-start gap-3 sm:gap-4">
                  <button
                    type="button"
                    onClick={() => toggle(s.key)}
                    aria-label={isDone ? `${s.label} 완료 취소` : `${s.label} 완료 표시`}
                    className={cn(
                      "shrink-0 w-9 h-9 rounded-full flex items-center justify-center border-2 transition-colors",
                      isDone
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : isCurrent
                          ? "border-primary text-primary"
                          : "border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground"
                    )}
                  >
                    {isDone ? <Check className="w-5 h-5" /> : <span className="text-sm font-semibold">{s.no}</span>}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={cn("w-4 h-4 shrink-0",
                        isDone ? "text-emerald-600" : isCurrent ? "text-primary" : "text-muted-foreground")} />
                      <h3 className="font-semibold truncate">{s.label}</h3>
                      {isCurrent && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          지금 단계
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{s.desc}</p>
                  </div>
                  <div className="shrink-0 flex flex-col sm:flex-row gap-2">
                    <Button
                      size="sm"
                      variant={isCurrent ? "default" : isDone ? "outline" : "secondary"}
                      onClick={() => goStep(s)}
                    >
                      {isDone ? "다시 보기" : "지금 하기"}
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>

      <div className="mt-8 text-center text-xs text-muted-foreground">
        팁: 각 단계 옆 동그라미를 직접 눌러 완료/취소를 수동으로 바꿀 수 있습니다.
      </div>
    </div>
  );
}
