import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { A4DocumentFrame, type A4DocumentFrameHandle } from "@/components/a4-document-frame";
import { downloadElementAsPng, safeFilename, sharePdfFromElement } from "@/lib/document-export";
import { formatKoreanDate } from "@/lib/official-document";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { detectFollowUp, type FollowUpDetection, type FollowUpSource } from "@/lib/follow-up-detection";
import { FollowUpSuggestionDialog, isFollowUpDismissed } from "@/components/follow-up-suggestion-dialog";
import {
  useApi, todayISO, thisMonth, SECTIONS,
  type MonthlyReport,
} from "./shared";
import { ReportActionRow, withReadyDoc } from "./report-actions";

export function MonthlyTab() {
  const [month, setMonth] = useState(thisMonth());
  const { call } = useApi();
  const { user } = useAuth();
  const { toast } = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const frameRef = useRef<A4DocumentFrameHandle>(null);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpDetection, setFollowUpDetection] = useState<FollowUpDetection | null>(null);
  const [followUpSource, setFollowUpSource] = useState<FollowUpSource | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["work-log-report-monthly", month],
    queryFn: () => call<MonthlyReport>(`/work-log-reports/monthly?month=${month}`),
  });

  // [Task #269] 월보 진입 시 해당 월의 메모/일보/주보 텍스트를 모아 후속조치
  // 키워드를 1회 감지하고 리마인드 팝업을 띄운다. "다음에 하기" 후엔 같은 달
  // 동안 다시 뜨지 않는다 (FollowUpSuggestionDialog 의 dismiss 셋 활용).
  useEffect(() => {
    if (!data) return;
    const memos = [
      data.textSummary,
      ...data.weeks.map((w) => w.textSummary),
      ...Object.values(data.sectionTotals).flatMap((s) => s.memos),
      ...data.weeks.flatMap((w) => Object.values(w.sectionTotals).flatMap((s) => s.memos)),
    ]
      .filter(Boolean)
      .join("\n");
    const detection = detectFollowUp(memos);
    if (!detection) return;
    // dismiss 키 안정성: 사용자 세션은 한 건물 컨텍스트만 보유하므로 month 만으로
    // 충분히 식별 가능. 건물명 변경/동명 건물 간 충돌 가능성을 피하기 위해
    // 가변적인 buildingName 은 키에서 제외한다.
    const nextSource: FollowUpSource = {
      type: "monthly_journal",
      id: data.month,
      title: `${data.month} 월간 후속조치 리마인드 — ${detection.snippet.slice(0, 30)}`,
      occurredAt: data.monthStart,
    };
    if (isFollowUpDismissed(nextSource)) return;
    setFollowUpSource(nextSource);
    setFollowUpDetection(detection);
    setFollowUpOpen(true);
  }, [data]);

  async function exportPng() {
    if (!ref.current || !data) return;
    setSaving(true);
    try {
      await withReadyDoc(frameRef, async () => {
        if (!ref.current) return;
        await downloadElementAsPng(ref.current, safeFilename(`월간일지_${data.month}`), { compact: true });
      });
      toast({ title: "이미지 저장 완료" });
    } catch (e) {
      toast({ title: "내보내기 실패", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }
  async function share() {
    if (!data || !ref.current) return;
    setSharing(true);
    try {
      // [Task #499] 월간 보고서 공유는 텍스트가 아닌 PDF 로 전송한다.
      // 파일명: 월간보고서_(건물명)_(작성자)_(생성연월).pdf
      // 생성연월은 KST 기준 YYYY-MM (UTC 기준 toISOString 은 월 경계 오차 발생).
      const ym = thisMonth();
      const buildingName = data.buildingName ?? "건물";
      const authorName = user?.name || user?.username || "관리자";
      const filename = safeFilename(`월간보고서_${buildingName}_${authorName}_${ym}`);
      const result = await withReadyDoc(frameRef, async () => {
        if (!ref.current) return "failed" as const;
        return await sharePdfFromElement(ref.current, filename, `월간보고서 ${buildingName}`);
      });
      if (result === "downloaded") toast({ title: "PDF 다운로드 완료" });
      else if (result === "failed") toast({ title: "공유 실패", variant: "destructive" });
    } catch (e) {
      toast({ title: "공유 실패", description: String(e), variant: "destructive" });
    } finally {
      setSharing(false);
    }
  }
  function print() {
    void withReadyDoc(frameRef, () => { window.print(); });
  }

  function shiftMonth(delta: number) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <div className="space-y-3 pt-3">
      <FollowUpSuggestionDialog
        open={followUpOpen}
        source={followUpSource}
        detection={followUpDetection}
        onClose={() => setFollowUpOpen(false)}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => shiftMonth(-1)} data-testid="monthly-prev"><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-sm font-medium" data-testid="monthly-label">{month}</span>
          <Button variant="outline" size="sm" onClick={() => shiftMonth(1)} data-testid="monthly-next"><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>

      <ReportActionRow
        testidPrefix="monthly"
        onSaveImage={exportPng}
        onShare={share}
        onPrint={print}
        saving={saving}
        sharing={sharing}
      />

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : data ? (
        <A4DocumentFrame ref={frameRef}>
          <div ref={ref} className="a4-document text-foreground" style={{ fontFamily: "'Noto Sans KR', 'Malgun Gothic', sans-serif" }}>
            <MonthlyA4ReportBody report={data} />
          </div>
        </A4DocumentFrame>
      ) : null}
    </div>
  );
}

/* [Task #205] 월간 일지 — A4 보고서 양식. 주차가 많을 경우 여러 장 출력 */
function MonthlyA4ReportBody({ report }: { report: MonthlyReport }) {
  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-bold text-center border-b-2 border-black pb-3">월 간 업 무 보 고 서</h2>
      <table className="w-full text-sm border-collapse mt-2">
        <tbody>
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold w-24 p-2">건물명</td>
            <td className="border border-gray-400 p-2">{report.buildingName ?? "-"}</td>
            <td className="border border-gray-400 bg-gray-100 font-semibold w-24 p-2">대상월</td>
            <td className="border border-gray-400 p-2">{report.month}</td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold p-2">기간</td>
            <td className="border border-gray-400 p-2">{formatKoreanDate(report.monthStart)} ~ {formatKoreanDate(report.monthEnd)}</td>
            <td className="border border-gray-400 bg-gray-100 font-semibold p-2">작성일</td>
            <td className="border border-gray-400 p-2">{formatKoreanDate(todayISO())}</td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold p-2">총괄</td>
            <td className="border border-gray-400 p-2" colSpan={3}>
              일지 {report.totalJournals}일 · 업무 기록 {report.totalEntries}건 · {report.weeks.length}주차 · 특이사항 {report.issues}건
            </td>
          </tr>
        </tbody>
      </table>

      <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">1. 월간 요약</p>
      <div className="text-[14px] leading-7 whitespace-pre-line border border-gray-300 rounded p-3 text-justify" style={{ textJustify: "inter-word" }} data-testid="monthly-text-summary">
        {report.textSummary || "기록 없음"}
      </div>

      <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">2. 주차별 요약</p>
      {report.weeks.length === 0 ? (
        <p className="text-sm text-gray-600">기록 없음</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="border border-gray-400 bg-gray-100 p-2 w-44">주차</th>
              <th className="border border-gray-400 bg-gray-100 p-2 w-20">일지</th>
              <th className="border border-gray-400 bg-gray-100 p-2 w-20">기록</th>
              <th className="border border-gray-400 bg-gray-100 p-2 w-20">특이</th>
              <th className="border border-gray-400 bg-gray-100 p-2">요약</th>
            </tr>
          </thead>
          <tbody>
            {report.weeks.map((w) => (
              <tr key={w.weekStart} data-testid={`monthly-week-${w.weekStart}`}>
                <td className="border border-gray-400 p-2">{w.weekStart}<br />~ {w.weekEnd}</td>
                <td className="border border-gray-400 p-2 text-center">{w.totalJournals}일</td>
                <td className="border border-gray-400 p-2 text-center">{w.totalEntries}건</td>
                <td className="border border-gray-400 p-2 text-center">{w.issues}건</td>
                <td className="border border-gray-400 p-2 whitespace-pre-line text-justify" style={{ textJustify: "inter-word" }}>{w.textSummary || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">3. 영역별 특이사항</p>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="border border-gray-400 bg-gray-100 p-2 w-32">영역</th>
            <th className="border border-gray-400 bg-gray-100 p-2 w-20">특이일수</th>
            <th className="border border-gray-400 bg-gray-100 p-2">주요 메모</th>
          </tr>
        </thead>
        <tbody>
          {SECTIONS.map((s) => {
            const tot = report.sectionTotals[s.key];
            return (
              <tr key={s.key}>
                <td className="border border-gray-400 p-2 font-semibold">{s.label}</td>
                <td className="border border-gray-400 p-2 text-center">{tot.issues}일</td>
                <td className="border border-gray-400 p-2">
                  {tot.memos.length === 0 ? "-" : (
                    <ul className="space-y-0.5">{tot.memos.slice(0, 5).map((m, i) => <li key={i}>· {m}</li>)}</ul>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">4. 분류별 기록 합계</p>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="border border-gray-400 bg-gray-100 p-2">시설</th>
            <th className="border border-gray-400 bg-gray-100 p-2">관리비</th>
            <th className="border border-gray-400 bg-gray-100 p-2">민원</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-gray-400 p-2 text-center">{report.byCategory.facility}건</td>
            <td className="border border-gray-400 p-2 text-center">{report.byCategory.bill}건</td>
            <td className="border border-gray-400 p-2 text-center">{report.byCategory.complaint}건</td>
          </tr>
        </tbody>
      </table>

      <div className="text-right pt-8 text-sm space-y-1">
        <p>{formatKoreanDate(todayISO())}</p>
        <p>작성자: 관리자 (서명)</p>
      </div>
    </div>
  );
}
