import { useEffect, useState } from "react";
import { api, type WorkLogEntry } from "@/lib/api";
import {
  CATEGORY_LABEL,
  formatTime,
  todayKst,
  formatKstDate,
} from "@/lib/utils";
import { Modal } from "./Modal";

const CATEGORIES: { value: WorkLogEntry["category"]; label: string }[] = [
  { value: "facility", label: "시설" },
  { value: "complaint", label: "민원" },
  { value: "general", label: "일반" },
];

type Props = {
  refreshKey?: number;
  onChanged?: () => void;
};

export function QuickEntry({ refreshKey = 0, onChanged }: Props) {
  const [date, setDate] = useState(todayKst());
  const [category, setCategory] = useState<WorkLogEntry["category"]>("facility");
  const [memo, setMemo] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [entries, setEntries] = useState<WorkLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationOpen, setValidationOpen] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .listEntries({ from: date, to: date })
      .then((rows) => {
        if (cancelled) return;
        setEntries(rows);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, refreshKey, tick]);

  async function handleSubmit() {
    if (!memo.trim()) {
      setValidationOpen(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createEntry({
        category,
        memo: memo.trim(),
        photoUrl: photoUrl.trim() || null,
        occurredDate: date,
      });
      setMemo("");
      setPhotoUrl("");
      setTick((t) => t + 1);
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("이 항목을 삭제하시겠습니까?")) return;
    try {
      await api.deleteEntry(id);
      setTick((t) => t + 1);
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="card" data-testid="quick-entry">
      <h3 className="card-title">빠른 메모 입력</h3>
      <p className="card-sub">
        시설/민원/일반 카테고리로 즉시 기록합니다. 사진 URL은 선택입니다.
      </p>

      <div className="field">
        <label className="label">날짜</label>
        <input
          type="date"
          className="input"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="label">카테고리</label>
        <div className="status-grid">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              className={"status-chip" + (category === c.value ? " active" : "")}
              onClick={() => setCategory(c.value)}
              data-testid={`quick-cat-${c.value}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="label">
          메모<span className="required">*</span>
        </label>
        <textarea
          className="textarea"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="예: 1층 정수기 누수 발견 — 임시조치 후 업체 호출"
          data-testid="quick-memo"
        />
      </div>

      <div className="field">
        <label className="label">사진 URL (선택)</label>
        <input
          type="url"
          className="input"
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
          placeholder="https://..."
          data-testid="quick-photo"
        />
      </div>

      {error && (
        <p style={{ color: "var(--danger)", fontSize: 13, margin: "8px 0" }}>
          {error}
        </p>
      )}

      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn primary"
          onClick={handleSubmit}
          disabled={saving}
          data-testid="quick-submit"
        >
          {saving ? "저장중…" : "기록 추가"}
        </button>
      </div>

      <h4 className="card-title" style={{ marginTop: 20 }}>
        {formatKstDate(date)} 기록
      </h4>
      {loading ? (
        <p className="empty">불러오는 중…</p>
      ) : entries.length === 0 ? (
        <p className="empty">등록된 메모가 없습니다.</p>
      ) : (
        <div data-testid="entry-list">
          {entries.map((e) => (
            <div key={e.id} className="entry">
              <div style={{ flex: 1 }}>
                <div className="entry-meta">
                  <span className={`tag ${e.category}`}>
                    {CATEGORY_LABEL[e.category]}
                  </span>
                  <span className="entry-time">{formatTime(e.occurredAt)}</span>
                </div>
                <p className="entry-memo">{e.memo}</p>
                {e.photoUrl && (
                  <img
                    className="entry-photo"
                    src={e.photoUrl}
                    alt="첨부"
                    onError={(ev) => {
                      (ev.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}
              </div>
              <div className="entry-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => handleDelete(e.id)}
                  data-testid={`entry-delete-${e.id}`}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={validationOpen}
        title="메모를 입력해주세요"
        onClose={() => setValidationOpen(false)}
      >
        <p>메모는 빠른 기록을 위해 반드시 입력해야 합니다.</p>
      </Modal>
    </div>
  );
}
