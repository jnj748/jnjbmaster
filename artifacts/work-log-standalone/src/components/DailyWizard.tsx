import { useEffect, useState } from "react";
import { api, type DailyJournal } from "@/lib/api";
import {
  SECTION_LABEL,
  STATUS_OPTIONS,
  SPECIAL_STATUS,
  isSpecial,
  type SectionKey,
  formatKstDate,
} from "@/lib/utils";
import { Modal } from "./Modal";

const SECTION_ORDER: SectionKey[] = ["security", "cleaning", "facility", "complaint"];

type SectionState = {
  status: string;
  memo: string;
  photoUrl: string;
};

type WizardState = Record<SectionKey, SectionState>;

const EMPTY_SECTION: SectionState = { status: "", memo: "", photoUrl: "" };

function emptyState(): WizardState {
  return {
    security: { ...EMPTY_SECTION },
    cleaning: { ...EMPTY_SECTION },
    facility: { ...EMPTY_SECTION },
    complaint: { ...EMPTY_SECTION },
  };
}

function fromJournal(j: DailyJournal | null): WizardState {
  const s = emptyState();
  if (!j) return s;
  s.security = {
    status: j.securityStatus ?? "",
    memo: j.securityMemo ?? "",
    photoUrl: j.securityPhotoUrl ?? "",
  };
  s.cleaning = {
    status: j.cleaningStatus ?? "",
    memo: j.cleaningMemo ?? "",
    photoUrl: j.cleaningPhotoUrl ?? "",
  };
  s.facility = {
    status: j.facilityStatus ?? "",
    memo: j.facilityMemo ?? "",
    photoUrl: j.facilityPhotoUrl ?? "",
  };
  s.complaint = {
    status: j.complaintStatus ?? "",
    memo: j.complaintMemo ?? "",
    photoUrl: j.complaintPhotoUrl ?? "",
  };
  return s;
}

type Props = {
  date: string;
  onSaved?: () => void;
};

export function DailyWizard({ date, onSaved }: Props) {
  const [stepIdx, setStepIdx] = useState(0);
  const [state, setState] = useState<WizardState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<
    { key: SectionKey | "date"; reason: "status" | "special-memo" | "date" }[]
  >([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSavedAt(null);
    setStepIdx(0);
    api
      .getJournal(date)
      .then((j) => {
        if (cancelled) return;
        setState(fromJournal(j));
        if (j) {
          setSavedAt(formatKstDate(date) + " 저장본을 불러왔습니다.");
        }
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
  }, [date]);

  const currentKey = SECTION_ORDER[stepIdx];

  function update<T extends keyof SectionState>(field: T, value: string) {
    setState((prev) => ({
      ...prev,
      [currentKey]: { ...prev[currentKey], [field]: value },
    }));
  }

  function validateAll(): { key: SectionKey; reason: "status" | "special-memo" }[] {
    const issues: { key: SectionKey; reason: "status" | "special-memo" }[] = [];
    for (const k of SECTION_ORDER) {
      const status = state[k].status.trim();
      if (!status) {
        issues.push({ key: k, reason: "status" });
      } else if (isSpecial(status) && !state[k].memo.trim()) {
        issues.push({ key: k, reason: "special-memo" });
      }
    }
    return issues;
  }

  async function handleSave() {
    const issues: { key: SectionKey | "date"; reason: "status" | "special-memo" | "date" }[] = [];
    if (!date || !date.trim()) {
      issues.push({ key: "date", reason: "date" });
    }
    issues.push(...validateAll());
    if (issues.length > 0) {
      setMissing(issues);
      const firstSection = issues.find((i) => i.key !== "date");
      if (firstSection) {
        const firstIdx = SECTION_ORDER.indexOf(firstSection.key as SectionKey);
        if (firstIdx >= 0) setStepIdx(firstIdx);
      }
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.saveJournal(date, {
        securityStatus: state.security.status,
        securityMemo: state.security.memo || null,
        securityPhotoUrl: state.security.photoUrl || null,
        cleaningStatus: state.cleaning.status,
        cleaningMemo: state.cleaning.memo || null,
        cleaningPhotoUrl: state.cleaning.photoUrl || null,
        facilityStatus: state.facility.status,
        facilityMemo: state.facility.memo || null,
        facilityPhotoUrl: state.facility.photoUrl || null,
        complaintStatus: state.complaint.status,
        complaintMemo: state.complaint.memo || null,
        complaintPhotoUrl: state.complaint.photoUrl || null,
      });
      setSavedAt(`${formatKstDate(date)} 일지가 저장되었습니다.`);
      onSaved?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="card">
        <p className="empty">불러오는 중…</p>
      </div>
    );
  }

  const sectionLabel = SECTION_LABEL[currentKey];
  const options = STATUS_OPTIONS[currentKey];
  const sectionState = state[currentKey];

  return (
    <div className="card" data-testid="daily-wizard">
      <div className="wizard-progress">
        {SECTION_ORDER.map((k, i) => (
          <div
            key={k}
            className={"step" + (i <= stepIdx ? " active" : "")}
            aria-label={SECTION_LABEL[k]}
          />
        ))}
      </div>
      <h3 className="wizard-step-title">
        {stepIdx + 1}. {sectionLabel}
      </h3>
      <p className="wizard-step-desc">
        {formatKstDate(date)} · 항목별 상태와 메모를 입력하세요.
      </p>

      <div className="field">
        <label className="label">
          상태<span className="required">*</span>
        </label>
        <div className="status-grid">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={
                "status-chip" +
                (sectionState.status === opt.value ? " active" : "")
              }
              onClick={() => update("status", opt.value)}
              data-testid={`status-${currentKey}-${opt.value}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="label">
          메모
          {isSpecial(sectionState.status) && (
            <span className="required"> * (특이사항은 필수)</span>
          )}
        </label>
        <textarea
          className="textarea"
          value={sectionState.memo}
          onChange={(e) => update("memo", e.target.value)}
          placeholder={
            isSpecial(sectionState.status)
              ? "특이사항 내용을 자세히 적어주세요"
              : "세부 내용을 적어주세요 (선택)"
          }
          data-testid={`memo-${currentKey}`}
        />
      </div>

      <div className="field">
        <label className="label">사진 URL (선택)</label>
        <input
          type="url"
          className="input"
          value={sectionState.photoUrl}
          onChange={(e) => update("photoUrl", e.target.value)}
          placeholder="https://..."
          data-testid={`photo-${currentKey}`}
        />
      </div>

      {error && (
        <p style={{ color: "var(--danger)", fontSize: 13, margin: "8px 0" }}>
          {error}
        </p>
      )}
      {savedAt && (
        <p style={{ color: "var(--success)", fontSize: 13, margin: "8px 0" }}>
          {savedAt}
        </p>
      )}

      <div className="wizard-actions">
        <button
          type="button"
          className="btn ghost"
          onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
          disabled={stepIdx === 0}
        >
          이전
        </button>
        {stepIdx < SECTION_ORDER.length - 1 ? (
          <button
            type="button"
            className="btn primary"
            onClick={() => setStepIdx((i) => i + 1)}
            data-testid="wizard-next"
          >
            다음
          </button>
        ) : (
          <button
            type="button"
            className="btn primary"
            onClick={handleSave}
            disabled={saving}
            data-testid="wizard-save"
          >
            {saving ? "저장중…" : "일지 저장"}
          </button>
        )}
      </div>

      <Modal
        open={missing.length > 0}
        title="필수 항목을 입력해주세요"
        onClose={() => setMissing([])}
      >
        <p>다음 항목을 입력해야 일지를 저장할 수 있습니다.</p>
        <ul className="modal-list">
          {missing.map((m) => (
            <li key={`${m.key}-${m.reason}`}>
              {m.reason === "date"
                ? "기준일"
                : m.reason === "status"
                  ? `${SECTION_LABEL[m.key as SectionKey]} 상태`
                  : `${SECTION_LABEL[m.key as SectionKey]} ${SPECIAL_STATUS} 메모`}
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
