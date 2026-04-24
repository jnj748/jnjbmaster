import { useEffect, useState } from "react";
import { api, type ReportPayload } from "@/lib/api";
import {
  CATEGORY_LABEL,
  SECTION_LABEL,
  SPECIAL_STATUS,
  formatKstFull,
  isSpecial,
  todayKst,
  type SectionKey,
} from "@/lib/utils";
import { A4Frame } from "./A4Frame";

type Mode = "daily" | "weekly" | "monthly";

type Props = {
  mode: Mode;
};

const SECTION_KEYS: SectionKey[] = ["security", "cleaning", "facility", "complaint"];

function statusOf(j: ReportPayload["journals"][number], k: SectionKey): string {
  if (k === "security") return j.securityStatus ?? "";
  if (k === "cleaning") return j.cleaningStatus ?? "";
  if (k === "facility") return j.facilityStatus ?? "";
  return j.complaintStatus ?? "";
}

function memoOf(j: ReportPayload["journals"][number], k: SectionKey): string {
  if (k === "security") return j.securityMemo ?? "";
  if (k === "cleaning") return j.cleaningMemo ?? "";
  if (k === "facility") return j.facilityMemo ?? "";
  return j.complaintMemo ?? "";
}

export function ReportView({ mode }: Props) {
  const [date, setDate] = useState(todayKst());
  const [payload, setPayload] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    setGenerated(false);
    try {
      const data =
        mode === "daily"
          ? await api.dailyReport(date)
          : mode === "weekly"
            ? await api.weeklyReport(date)
            : await api.monthlyReport(date);
      setPayload(data);
      setGenerated(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPayload(null);
    setGenerated(false);
  }, [mode, date]);

  const title =
    mode === "daily"
      ? "일일 업무보고서 (일보)"
      : mode === "weekly"
        ? "주간 업무보고서 (주보)"
        : "월간 업무보고서 (월보)";
  const summary = payload
    ? payload.summary ?? {
        days: payload.journals.length,
        facility: payload.entries.filter((e) => e.category === "facility").length,
        complaint: payload.entries.filter((e) => e.category === "complaint").length,
        general: payload.entries.filter((e) => e.category === "general").length,
        special: payload.journals.reduce(
          (acc, j) =>
            acc +
            (isSpecial(j.securityStatus) ? 1 : 0) +
            (isSpecial(j.cleaningStatus) ? 1 : 0) +
            (isSpecial(j.facilityStatus) ? 1 : 0) +
            (isSpecial(j.complaintStatus) ? 1 : 0),
          0,
        ),
      }
    : null;
  const specialRows = payload
    ? payload.journals
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .flatMap((j) =>
          (["security", "cleaning", "facility", "complaint"] as SectionKey[])
            .filter((k) => isSpecial(statusOf(j, k)))
            .map((k) => ({
              date: j.date,
              section: SECTION_LABEL[k],
              memo: memoOf(j, k),
            })),
        )
    : [];

  return (
    <div className="card" data-testid={`report-${mode}`}>
      <h3 className="card-title">{title}</h3>
      <p className="card-sub">
        기준일을 선택하고 "보고서 생성" 버튼을 눌러주세요. 생성 후 브라우저
        인쇄(⌘P / Ctrl+P)로 PDF로 저장할 수 있습니다.
      </p>

      <div className="report-toolbar no-print">
        <input
          type="date"
          className="input"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <button
          type="button"
          className="btn primary"
          onClick={generate}
          disabled={loading}
          data-testid={`generate-${mode}`}
        >
          {loading ? "생성중…" : "보고서 생성"}
        </button>
        {generated && (
          <button
            type="button"
            className="btn"
            onClick={() => window.print()}
            data-testid={`print-${mode}`}
          >
            인쇄 / PDF 저장
          </button>
        )}
      </div>

      {error && (
        <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>
      )}

      {!payload ? (
        <p className="empty">보고서를 생성하면 이 자리에 결과가 표시됩니다.</p>
      ) : (
        <>
          <div className="summary-grid no-print">
            <div className="summary-tile">
              <div className="label">기록 일수</div>
              <div className="value">{summary?.days ?? 0}</div>
            </div>
            <div className="summary-tile">
              <div className="label">시설</div>
              <div className="value">{summary?.facility ?? 0}</div>
            </div>
            <div className="summary-tile">
              <div className="label">민원</div>
              <div className="value">{summary?.complaint ?? 0}</div>
            </div>
            <div className="summary-tile">
              <div className="label">일반</div>
              <div className="value">{summary?.general ?? 0}</div>
            </div>
            <div
              className={
                "summary-tile" +
                ((summary?.special ?? 0) > 0 ? " special" : "")
              }
              data-testid={`summary-special-${mode}`}
            >
              <div className="label">{SPECIAL_STATUS}</div>
              <div className="value">{summary?.special ?? 0}</div>
            </div>
          </div>

          <A4Frame
            title={title}
            period={`${payload.start} ~ ${payload.end}`}
          >
            {specialRows.length > 0 && (
              <>
                <div className="section-title special-title">
                  ★ {SPECIAL_STATUS} 강조 ({specialRows.length}건)
                </div>
                <table className="special-table">
                  <thead>
                    <tr>
                      <th style={{ width: "16%" }}>날짜</th>
                      <th style={{ width: "12%" }}>구분</th>
                      <th>내용</th>
                    </tr>
                  </thead>
                  <tbody>
                    {specialRows.map((r, i) => (
                      <tr
                        key={`${r.date}-${r.section}-${i}`}
                        className="special-row"
                      >
                        <td>{r.date}</td>
                        <td>
                          <strong>{r.section}</strong>
                        </td>
                        <td>{r.memo || "(메모 없음)"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <div className="section-title">1. 일자별 일지 요약</div>
            {payload.journals.length === 0 ? (
              <p>해당 기간 일지가 없습니다.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "14%" }}>날짜</th>
                    {SECTION_KEYS.map((k) => (
                      <th key={k}>{SECTION_LABEL[k]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payload.journals
                    .slice()
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map((j) => {
                      const rowHasSpecial = SECTION_KEYS.some((k) =>
                        isSpecial(statusOf(j, k)),
                      );
                      return (
                        <tr
                          key={j.date}
                          className={rowHasSpecial ? "special-row" : undefined}
                        >
                          <td>{j.date}</td>
                          {SECTION_KEYS.map((k) => {
                            const status = statusOf(j, k);
                            const memo = memoOf(j, k);
                            const special = isSpecial(status);
                            return (
                              <td
                                key={k}
                                className={special ? "special-cell" : undefined}
                              >
                                <strong>
                                  {special && "★ "}
                                  {status || "-"}
                                </strong>
                                {memo && (
                                  <div style={{ fontSize: 11, color: "#444" }}>
                                    {memo}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}

            <div className="section-title">2. 카테고리별 메모 ({payload.entries.length}건)</div>
            {payload.entries.length === 0 ? (
              <p>해당 기간 메모가 없습니다.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "18%" }}>일시</th>
                    <th style={{ width: "10%" }}>구분</th>
                    <th>내용</th>
                  </tr>
                </thead>
                <tbody>
                  {payload.entries
                    .slice()
                    .sort(
                      (a, b) =>
                        new Date(a.occurredAt).getTime() -
                        new Date(b.occurredAt).getTime(),
                    )
                    .map((e) => (
                      <tr key={e.id}>
                        <td>{formatKstFull(e.occurredAt)}</td>
                        <td>{CATEGORY_LABEL[e.category]}</td>
                        <td>{e.memo}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </A4Frame>
        </>
      )}
    </div>
  );
}
