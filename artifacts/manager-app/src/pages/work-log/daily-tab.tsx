import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { AuthImage } from "@/components/auth-image";
import { A4DocumentFrame, type A4DocumentFrameHandle } from "@/components/a4-document-frame";
import { PhotoUploadField } from "@/components/photo-upload-field";
import { downloadElementAsPng, safeFilename, sharePdfFromElement } from "@/lib/document-export";
import { formatKoreanDate } from "@/lib/official-document";
import {
  ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle,
} from "lucide-react";
import {
  useApi, todayISO, addDays, thisMonth, SECTIONS, CATEGORY_LABEL,
  type DailyJournal, type DailyReport, type Status,
} from "./shared";
import { ReportActionRow, withReadyDoc } from "./report-actions";
import { printIsolatedNode } from "@/lib/print-isolate";

export function DailyTab({ autoOpenWizard = false, onAutoOpenConsumed }: { autoOpenWizard?: boolean; onAutoOpenConsumed?: () => void } = {}) {
  // [Task #250] 처리 내역에서 일지 행을 클릭하면 ?date=YYYY-MM-DD 가 함께 전달되어
  //            해당 일자가 기본 선택되도록 한다.
  const [date, setDate] = useState(() => {
    if (typeof window === "undefined") return todayISO();
    const sp = new URLSearchParams(window.location.search);
    const d = sp.get("date");
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayISO();
  });
  const [wizardOpen, setWizardOpen] = useState(false);
  const [pendingAutoOpen, setPendingAutoOpen] = useState(false);
  const { call } = useApi();

  useEffect(() => {
    if (autoOpenWizard) {
      setDate(todayISO());
      setPendingAutoOpen(true);
      onAutoOpenConsumed?.();
    }
  }, [autoOpenWizard, onAutoOpenConsumed]);

  const reportQ = useQuery({
    queryKey: ["work-log-report-daily", date],
    queryFn: () => call<DailyReport>(`/work-log-reports/daily?date=${date}`),
  });

  useEffect(() => {
    if (pendingAutoOpen && !reportQ.isLoading && !reportQ.isFetching) {
      setWizardOpen(true);
      setPendingAutoOpen(false);
    }
  }, [pendingAutoOpen, reportQ.isLoading, reportQ.isFetching]);

  return (
    <div className="space-y-3 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="outline" size="sm" onClick={() => setDate(addDays(date, -1))} data-testid="daily-prev">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-36 sm:w-40" data-testid="daily-date" />
          <Button variant="outline" size="sm" onClick={() => setDate(addDays(date, 1))} data-testid="daily-next">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <Button size="sm" className="shrink-0 whitespace-nowrap" onClick={() => setWizardOpen(true)} data-testid="open-wizard">
          {reportQ.data?.journal ? "일지 수정" : "일지 작성"}
        </Button>
      </div>

      {reportQ.isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : reportQ.data ? (
        <DailyReportPreview report={reportQ.data} />
      ) : null}

      {wizardOpen && (
        <DailyJournalWizard
          date={date}
          existing={reportQ.data?.journal ?? null}
          onClose={() => setWizardOpen(false)}
          onSaved={() => { setWizardOpen(false); reportQ.refetch(); }}
        />
      )}
    </div>
  );
}

function DailyReportPreview({ report }: { report: DailyReport }) {
  const ref = useRef<HTMLDivElement>(null);
  const frameRef = useRef<A4DocumentFrameHandle>(null);
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);

  async function exportPng() {
    if (!ref.current) return;
    setSaving(true);
    try {
      await withReadyDoc(frameRef, async () => {
        if (!ref.current) return;
        await downloadElementAsPng(ref.current, safeFilename(`일일일지_${report.date}`), { compact: true });
      });
      toast({ title: "이미지 저장 완료" });
    } catch (e) {
      toast({ title: "내보내기 실패", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }
  async function share() {
    if (!ref.current) return;
    setSharing(true);
    try {
      // [Task #499] 일/주/월 보고서 공유는 텍스트가 아닌 PDF 로 전송한다.
      // 파일명: 일일보고서_(건물명)_(작성자)_(생성연월).pdf
      // 생성연월은 KST 기준 YYYY-MM (UTC 기준 toISOString 은 월 경계 오차 발생).
      const ym = thisMonth();
      const buildingName = report.buildingName ?? "건물";
      const authorName = report.authorName || "관리자";
      const filename = safeFilename(`일일보고서_${buildingName}_${authorName}_${ym}`);
      const result = await withReadyDoc(frameRef, async () => {
        if (!ref.current) return "failed" as const;
        return await sharePdfFromElement(ref.current, filename, `일일보고서 ${buildingName}`);
      });
      if (result === "downloaded") toast({ title: "PDF 다운로드 완료" });
      else if (result === "failed") toast({ title: "공유 실패", variant: "destructive" });
      // "shared": OS 공유 시트가 처리하므로 별도 토스트 생략
    } catch (e) {
      toast({ title: "공유 실패", description: String(e), variant: "destructive" });
    } finally {
      setSharing(false);
    }
  }
  function print() {
    // [Task #554] withReadyDoc 가 frame 의 transform-scale 을 잠시 풀어준 뒤,
    //   printIsolatedNode 가 .a4-document 노드를 `<body>` 직속 격리 컨테이너로
    //   deep-clone 해 인쇄한다. 이전 #543~#545 의 `position: fixed` 회귀
    //   (본문 중상단부터 시작 + 2페이지 이후 백지) 를 자연 블록 흐름으로 해결.
    void withReadyDoc(frameRef, () => {
      printIsolatedNode(ref.current);
    });
  }

  return (
    <>
      <ReportActionRow
        testidPrefix="daily"
        onSaveImage={exportPng}
        onShare={share}
        onPrint={print}
        saving={saving}
        sharing={sharing}
      />

      <A4DocumentFrame ref={frameRef}>
        <div ref={ref} className="a4-document text-foreground space-y-3">
          <h2 className="text-2xl font-bold text-center border-b-2 border-black pb-3">일 일 업 무 보 고 서</h2>

          <table className="w-full text-sm border-collapse mt-2">
            <tbody>
              <tr>
                <td className="border border-gray-400 bg-gray-100 font-semibold w-24 p-2">건물명</td>
                <td className="border border-gray-400 p-2">{report.buildingName ?? "-"}</td>
                <td className="border border-gray-400 bg-gray-100 font-semibold w-24 p-2">일자</td>
                <td className="border border-gray-400 p-2">{formatKoreanDate(report.date)}</td>
              </tr>
              <tr>
                <td className="border border-gray-400 bg-gray-100 font-semibold p-2">작성자</td>
                <td className="border border-gray-400 p-2">{report.authorName ?? "-"}</td>
                <td className="border border-gray-400 bg-gray-100 font-semibold p-2">작성일</td>
                <td className="border border-gray-400 p-2">{formatKoreanDate(todayISO())}</td>
              </tr>
              <tr>
                <td className="border border-gray-400 bg-gray-100 font-semibold p-2">총괄</td>
                <td className="border border-gray-400 p-2" colSpan={3}>
                  업무 기록 {report.entries.length}건 · 법정업무 완료 {report.statutory.completed.length} / 미완료 {report.statutory.postponed.length} / 기안 {report.statutory.drafted.length}
                </td>
              </tr>
            </tbody>
          </table>

          <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">1. 일일 일지</p>
          {report.journal ? (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="border border-gray-400 bg-gray-100 p-2 w-28">영역</th>
                  <th className="border border-gray-400 bg-gray-100 p-2 w-24">상태</th>
                  <th className="border border-gray-400 bg-gray-100 p-2">메모</th>
                </tr>
              </thead>
              <tbody>
                {SECTIONS.map((s) => {
                  const status = report.journal![`${s.key}Status` as const] as Status;
                  const memo = report.journal![`${s.key}Memo` as const] as string | null;
                  return (
                    <tr key={s.key}>
                      <td className="border border-gray-400 p-2 font-semibold">{s.label}</td>
                      <td className="border border-gray-400 p-2 text-center">
                        {status === "ok" ? "이상 없음" : "특이사항"}
                      </td>
                      <td className="border border-gray-400 p-2 whitespace-pre-line text-justify" style={{ textJustify: "inter-word" }}>{memo || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-muted-foreground border border-gray-300 rounded p-3">아직 작성되지 않았습니다.</p>
          )}

          {/* [일보] 첨부사진을 셀 안에 명함 크기(약 85mm 폭, 16:9) 고정 틀로
              자동첨부. 사진 유무·원본 비율과 무관하게 표 레이아웃이 변하지
              않도록 (1) table-layout: fixed 로 열 폭 고정, (2) 사진 없는 행도
              동일 크기의 placeholder 박스를 그려 행 높이를 일정하게 유지,
              (3) 메모 컬럼은 break-words 로 좁은 폭에서도 안정 정렬. */}
          <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">2. 금일 업무 기록 ({report.entries.length}건)</p>
          {report.entries.length === 0 ? (
            <p className="text-sm border border-gray-300 rounded p-3 text-muted-foreground">기록 없음</p>
          ) : (
            <table className="w-full text-sm border-collapse table-fixed">
              <colgroup>
                <col className="w-20" />
                <col />
                <col className="w-[200px] print:w-[90mm]" />
              </colgroup>
              <thead>
                <tr>
                  <th className="border border-gray-400 bg-gray-100 p-2">분류</th>
                  <th className="border border-gray-400 bg-gray-100 p-2">메모</th>
                  <th className="border border-gray-400 bg-gray-100 p-2">사진</th>
                </tr>
              </thead>
              <tbody>
                {report.entries.map((e) => (
                  <tr key={e.id} className="break-inside-avoid align-middle">
                    <td className="border border-gray-400 p-2 align-middle">{CATEGORY_LABEL[e.category]}</td>
                    <td className="border border-gray-400 p-2 whitespace-pre-line break-words align-middle text-justify" style={{ textJustify: "inter-word" }}>{e.memo}</td>
                    <td className="border border-gray-400 p-1 text-center align-middle">
                      <div
                        className={`mx-auto w-[180px] print:w-[85mm] aspect-video overflow-hidden rounded border bg-gray-50 ${
                          e.photoUrl ? "border-gray-300" : "border-dashed border-gray-300"
                        }`}
                      >
                        {e.photoUrl ? (
                          <AuthImage
                            src={e.photoUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[11px] text-muted-foreground">
                            사진 없음
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">3. 법정/정기 업무</p>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="border border-gray-400 bg-gray-100 p-2 w-24">구분</th>
                <th className="border border-gray-400 bg-gray-100 p-2 w-16">건수</th>
                <th className="border border-gray-400 bg-gray-100 p-2">내역</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-400 p-2 font-semibold">완료</td>
                <td className="border border-gray-400 p-2 text-center">{report.statutory.completed.length}</td>
                {/* [Task #474] 내역(쉼표 구분 긴 텍스트)은 compact 모드에서도 줄바꿈 유지. */}
                <td className="border border-gray-400 p-2 whitespace-normal break-words">
                  {report.statutory.completed.length === 0
                    ? "-"
                    : report.statutory.completed.map((c) => c.name).join(", ")}
                </td>
              </tr>
              <tr>
                <td className="border border-gray-400 p-2 font-semibold">미완료</td>
                <td className="border border-gray-400 p-2 text-center">{report.statutory.postponed.length}</td>
                <td className="border border-gray-400 p-2 whitespace-normal break-words">
                  {report.statutory.postponed.length === 0
                    ? "-"
                    : report.statutory.postponed.map((p) => p.name).join(", ")}
                </td>
              </tr>
              <tr>
                <td className="border border-gray-400 p-2 font-semibold">기안</td>
                <td className="border border-gray-400 p-2 text-center">{report.statutory.drafted.length}</td>
                <td className="border border-gray-400 p-2 whitespace-normal break-words">
                  {report.statutory.drafted.length === 0
                    ? "-"
                    : report.statutory.drafted.map((d) => d.title).join(", ")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </A4DocumentFrame>
    </>
  );
}

/* ─────────── 일일 일지 4단계 위저드 ─────────── */
export function DailyJournalWizard({
  date, existing, onClose, onSaved,
}: { date: string; existing: DailyJournal | null; onClose: () => void; onSaved: () => void }) {
  const { call } = useApi();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    securityStatus: existing?.securityStatus ?? "ok" as Status,
    securityMemo: existing?.securityMemo ?? "",
    securityPhotoUrl: existing?.securityPhotoUrl ?? null as string | null,
    cleaningStatus: existing?.cleaningStatus ?? "ok" as Status,
    cleaningMemo: existing?.cleaningMemo ?? "",
    cleaningPhotoUrl: existing?.cleaningPhotoUrl ?? null as string | null,
    facilityStatus: existing?.facilityStatus ?? "ok" as Status,
    facilityMemo: existing?.facilityMemo ?? "",
    facilityPhotoUrl: existing?.facilityPhotoUrl ?? null as string | null,
    complaintStatus: existing?.complaintStatus ?? "ok" as Status,
    complaintMemo: existing?.complaintMemo ?? "",
    complaintPhotoUrl: existing?.complaintPhotoUrl ?? null as string | null,
  });

  const saveMut = useMutation({
    mutationFn: () => call<DailyJournal>(`/daily-journals/${date}`, {
      method: "PUT", body: JSON.stringify(form),
    }),
    onSuccess: () => {
      // [Task #269] 일보 저장 시 후속조치 팝업은 더 이상 띄우지 않는다.
      // 한 달 단위 누적 리마인드는 월보 탭에서만 1회 노출된다.
      toast({ title: "일일 일지가 저장되었습니다" });
      onSaved();
    },
    onError: (e) => toast({ title: "저장 실패", description: String(e), variant: "destructive" }),
  });

  // 단계 이동 시 자동 저장 (멱등 PUT). 실패해도 사용자 흐름은 막지 않는다.
  async function autoSave() {
    try {
      await call<DailyJournal>(`/daily-journals/${date}`, { method: "PUT", body: JSON.stringify(form) });
    } catch {
      // best-effort
    }
  }
  function goNext() { autoSave(); setStep(step + 1); }
  function goPrev() { autoSave(); setStep(step - 1); }

  const section = SECTIONS[step];
  const statusKey = `${section.key}Status` as const;
  const memoKey = `${section.key}Memo` as const;
  const photoKey = `${section.key}PhotoUrl` as const;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{date} · 일일 일지 ({step + 1}/4)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-1">
            {SECTIONS.map((_, i) => (
              <div key={i} className={`flex-1 h-1.5 rounded-full ${i <= step ? "bg-accent" : "bg-muted"}`} />
            ))}
          </div>

          <div>
            <h3 className="text-base font-semibold">{section.label}</h3>
            <p className="text-xs text-muted-foreground">오늘 이 영역에 특이사항이 있었나요?</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, [statusKey]: "ok" }))}
              data-testid={`wizard-${section.key}-ok`}
              className={`py-3 rounded-lg border flex items-center justify-center gap-1 ${
                form[statusKey] === "ok" ? "bg-emerald-50 border-emerald-500 text-emerald-700" : ""
              }`}
            >
              <CheckCircle2 className="w-4 h-4" /> 이상 없음
            </button>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, [statusKey]: "issue" }))}
              data-testid={`wizard-${section.key}-issue`}
              className={`py-3 rounded-lg border flex items-center justify-center gap-1 ${
                form[statusKey] === "issue" ? "bg-amber-50 border-amber-500 text-amber-700" : ""
              }`}
            >
              <AlertTriangle className="w-4 h-4" /> 특이사항
            </button>
          </div>

          <Textarea
            value={form[memoKey] ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, [memoKey]: e.target.value }))}
            placeholder={form[statusKey] === "issue" ? "어떤 일이 있었는지 알려주세요" : "메모 (선택)"}
            rows={3}
            data-testid={`wizard-${section.key}-memo`}
          />

          <PhotoUploadField
            label="사진 (선택)"
            value={form[photoKey] ?? null}
            onChange={(url) => setForm((f) => ({ ...f, [photoKey]: url }))}
            testId={`wizard-${section.key}-photo`}
          />

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => step === 0 ? onClose() : goPrev()} data-testid="wizard-prev">
              {step === 0 ? "취소" : "이전"}
            </Button>
            {step < 3 ? (
              <Button onClick={goNext} data-testid="wizard-next">다음</Button>
            ) : (
              <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} data-testid="wizard-save">
                {saveMut.isPending ? <Spinner className="w-4 h-4 mr-1" /> : null}
                저장
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
