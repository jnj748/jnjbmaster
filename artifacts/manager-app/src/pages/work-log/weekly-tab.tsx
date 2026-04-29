import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { A4DocumentFrame, type A4DocumentFrameHandle } from "@/components/a4-document-frame";
import { downloadElementAsPng, safeFilename, sharePdfFromElement } from "@/lib/document-export";
import { formatKoreanDate } from "@/lib/official-document";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import {
  useApi, todayISO, addDays, mondayOf, formatWeekLabel, thisMonth, SECTIONS,
  getCategoriesFor, useCurrentRole, CATEGORY_LABEL,
  type WeeklyReport,
} from "./shared";
import { ReportActionRow, withReadyDoc } from "./report-actions";
import { printIsolatedNode } from "@/lib/print-isolate";

export function WeeklyTab() {
  const [weekStart, setWeekStart] = useState(mondayOf(todayISO()));
  const { call } = useApi();
  const { user } = useAuth();
  const { toast } = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const frameRef = useRef<A4DocumentFrameHandle>(null);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["work-log-report-weekly", weekStart],
    queryFn: () => call<WeeklyReport>(`/work-log-reports/weekly?weekStart=${weekStart}`),
  });

  // [Task #269] 주보 이미지 내보내기/공유 시 후속조치 팝업은 더 이상 띄우지 않는다.
  // 한 달 단위 누적 리마인드는 월보 탭에서만 1회 노출된다.

  async function exportPng() {
    if (!ref.current || !data) return;
    setSaving(true);
    try {
      await withReadyDoc(frameRef, async () => {
        if (!ref.current) return;
        await downloadElementAsPng(ref.current, safeFilename(`주간일지_${data.weekStart}_${data.weekEnd}`), { compact: true });
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
      // [Task #499] 주간 보고서 공유는 텍스트가 아닌 PDF 로 전송한다.
      // 파일명: 주간보고서_(건물명)_(작성자)_(생성연월).pdf
      // 생성연월은 KST 기준 YYYY-MM (UTC 기준 toISOString 은 월 경계 오차 발생).
      const ym = thisMonth();
      const buildingName = data.buildingName ?? "건물";
      const authorName = user?.name || user?.username || "관리자";
      const filename = safeFilename(`주간보고서_${buildingName}_${authorName}_${ym}`);
      const result = await withReadyDoc(frameRef, async () => {
        if (!ref.current) return "failed" as const;
        return await sharePdfFromElement(ref.current, filename, `주간보고서 ${buildingName}`);
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
    // [Task #554] withReadyDoc + printIsolatedNode 조합으로 모달 외부 격리
    //   컨테이너에 .a4-document 를 deep-clone 해 인쇄. 자연 블록 흐름으로
    //   다중 페이지 정상 출력(이전 #543~#545 회귀 해결).
    void withReadyDoc(frameRef, () => { printIsolatedNode(ref.current); });
  }

  return (
    <div className="space-y-3 pt-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))} data-testid="weekly-prev"><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-sm font-medium" data-testid="weekly-range">{formatWeekLabel(weekStart)}</span>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))} data-testid="weekly-next"><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>

      <ReportActionRow
        testidPrefix="weekly"
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
            <WeeklyA4ReportBody report={data} />
          </div>
        </A4DocumentFrame>
      ) : null}
    </div>
  );
}

/* [Task #205] 주간 일지 — A4 보고서 양식. 내용이 길면 여러 장으로 출력된다. */
function WeeklyA4ReportBody({ report }: { report: WeeklyReport }) {
  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-bold text-center border-b-2 border-black pb-3">주 간 업 무 보 고 서</h2>
      <table className="w-full text-sm border-collapse mt-2">
        <tbody>
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold w-24 p-2">건물명</td>
            <td className="border border-gray-400 p-2">{report.buildingName ?? "-"}</td>
            <td className="border border-gray-400 bg-gray-100 font-semibold w-24 p-2">기간</td>
            <td className="border border-gray-400 p-2">{formatKoreanDate(report.weekStart)} ~ {formatKoreanDate(report.weekEnd)}</td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold p-2">작성일</td>
            <td className="border border-gray-400 p-2">{formatKoreanDate(todayISO())}</td>
            <td className="border border-gray-400 bg-gray-100 font-semibold p-2">주차</td>
            <td className="border border-gray-400 p-2">{formatWeekLabel(report.weekStart)}</td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold p-2">총괄</td>
            <td className="border border-gray-400 p-2" colSpan={3}>
              일지 {report.totalJournals}/7일 · 업무 기록 {report.totalEntries}건 · 특이사항 {report.issues}건
            </td>
          </tr>
        </tbody>
      </table>

      <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">1. 주간 요약</p>
      <div className="text-[14px] leading-7 whitespace-pre-line border border-gray-300 rounded p-3 text-justify" style={{ textJustify: "inter-word" }} data-testid="weekly-text-summary">
        {report.textSummary || "기록 없음"}
      </div>

      <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">2. 요일별 일지 / 기록</p>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="border border-gray-400 bg-gray-100 p-2 w-28">일자</th>
            <th className="border border-gray-400 bg-gray-100 p-2 w-20">일지</th>
            <th className="border border-gray-400 bg-gray-100 p-2 w-20">기록</th>
            <th className="border border-gray-400 bg-gray-100 p-2 w-20">특이</th>
            <th className="border border-gray-400 bg-gray-100 p-2">주요 메모</th>
          </tr>
        </thead>
        <tbody>
          {report.days.map((d) => (
            <tr key={d.date}>
              <td className="border border-gray-400 p-2">{d.date}</td>
              <td className="border border-gray-400 p-2 text-center">{d.hasJournal ? "✓" : "—"}</td>
              <td className="border border-gray-400 p-2 text-center">{d.entryCount}</td>
              <td className="border border-gray-400 p-2 text-center">{d.issueCount}</td>
              <td className="border border-gray-400 p-2">
                {d.topMemos.length === 0 ? "-" : (
                  <ul className="space-y-0.5">{d.topMemos.map((m, i) => <li key={i}>· {m}</li>)}</ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

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
      <CategorySummaryTable byCategory={report.byCategory} />

      <div className="text-right pt-8 text-sm space-y-1">
        <p>{formatKoreanDate(todayISO())}</p>
        <p>작성자: {/* author 정보는 일지 단위라 주간 보고서엔 표기 생략 */} 관리자 (서명)</p>
      </div>
    </div>
  );
}

/**
 * 분류별 기록 합계 표 — 직책별 카테고리 키가 다르므로 현재 사용자의 role 기준으로
 * 동적 컬럼을 그린다. byCategory 에 없는 키는 0으로 표기한다.
 */
function CategorySummaryTable({ byCategory }: { byCategory: Record<string, number> }) {
  const role = useCurrentRole();
  const cats = getCategoriesFor(role);
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr>
          {cats.map((c) => (
            <th key={c.value} className="border border-gray-400 bg-gray-100 p-2">
              {CATEGORY_LABEL[c.value] ?? c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {cats.map((c) => (
            <td key={c.value} className="border border-gray-400 p-2 text-center">
              {byCategory[c.value] ?? 0}건
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
