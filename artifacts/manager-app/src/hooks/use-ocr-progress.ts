// [Task #472] OCR 진행도 가로바를 위한 공유 진행률 훅.
//
// 입력으로 업로드 진행률(0~100, 보통 useUpload 의 progress)과 isUploading,
// isOcrPending, 선택적으로 isSaving / isError 를 받아 단계를 표현하는
// percent / phase / label 을 돌려준다.
//   - "idle"        : 아무것도 진행 중이 아님 (가로바 숨김)
//   - "uploading"   : 0 ~ 30% 구간을 실제 업로드 진행률에 맞춰 채움
//   - "recognizing" : 30 ~ 95% 구간을 시간 기반 ease-out 로 부드럽게 채움
//   - "saving"      : 30 ~ 95% 구간을 인식 단계와 같은 곡선으로 채움.
//                     계약서 등록처럼 OCR 이후 추가 저장 단계가 있는
//                     화면에서 사용. 기본 라벨은 "저장 중".
//   - "done"        : 100% 로 마무리, 짧은 지연 후 idle 로 리셋.
//                     단, isError 가 참이면 done 을 거치지 않고 즉시 idle.
//
// 메모/관리비 고지서/계약서/회계담당자 위저드 네 위치 모두 동일하게 사용하므로,
// 외부 호출자는 단계 라벨이나 백분율 계산을 신경 쓰지 않고 본 훅의 결과를
// `OcrProgressBar` 에 그대로 흘려주면 된다.

import { useEffect, useRef, useState } from "react";

export type OcrPhase = "idle" | "uploading" | "recognizing" | "saving" | "done";

interface Options {
  /** useUpload 등에서 노출하는 업로드 진행 중 여부. */
  isUploading: boolean;
  /** 0~100 사이 업로드 진행률. 30% 구간으로 압축되어 표시된다. */
  uploadProgress: number;
  /** OCR(AI) 인식 응답을 기다리는 중인지 여부. */
  isOcrPending: boolean;
  /**
   * OCR 이후 추가 저장 단계(예: 계약 생성 + 첨부 업로드) 진행 중 여부.
   * true 인 동안 phase 가 "saving" 으로 전환되어 같은 가로바가 이어진다.
   */
  isSaving?: boolean;
  /** 저장 단계 라벨. 미지정 시 "저장 중" 으로 표시한다. */
  savingLabel?: string;
  /**
   * 직전 작업이 실패했는지 여부. true 가 되는 순간 가로바는 즉시 사라진다
   * (100% 점프 없이 idle 로 전환). 호출측은 다음 시도를 시작하기 전에
   * false 로 다시 내려야 한다.
   */
  isError?: boolean;
}

export interface OcrProgressResult {
  /** 0~100 사이 정수 백분율. */
  percent: number;
  phase: OcrPhase;
  /** 단계 라벨(예: "사진 업로드 중 24%"). */
  label: string;
  /** idle 이 아닌지 여부 — 가로바 표시 여부 판단용. */
  active: boolean;
}

// 인식/저장 구간(30~95%)을 채우는 데 걸리는 기준 시간. 이보다 빨리 끝나면
// 즉시 95% → 100% 로 점프, 더 오래 걸리면 95% 근처에서 머무른다.
const RECOGNITION_DURATION_MS = 10_000;
// 1 - exp(-EASE_K) 로 정규화하면 t=1 일 때 정확히 1 이 된다.
const EASE_K = 2.5;
const EASE_NORMALIZER = 1 - Math.exp(-EASE_K);
// 업로드가 끝났는데 OCR(또는 다음 단계) 호출 시작이 한두 프레임 늦는 경우
// 가로바가 잠깐 "완료" 로 깜빡이지 않도록 짧게 기다린다.
const PHASE_GRACE_MS = 120;
// 100% 도달 후 가로바를 자연스럽게 사라지게 하는 지연.
const DONE_HOLD_MS = 500;

const RECOGNIZING_START = 30;
const RECOGNIZING_TARGET = 95;

export function useOcrProgress({
  isUploading,
  uploadProgress,
  isOcrPending,
  isSaving = false,
  savingLabel,
  isError = false,
}: Options): OcrProgressResult {
  const [percent, setPercent] = useState(0);
  const [phase, setPhase] = useState<OcrPhase>("idle");
  const phaseStartRef = useRef<number | null>(null);

  // 단계 전이 + 업로드 진행률 반영.
  useEffect(() => {
    // 실패 신호가 들어오면 즉시 가로바 숨김(100% 깜빡임 없이 idle).
    if (isError) {
      if (phase !== "idle") {
        setPhase("idle");
        setPercent(0);
      }
      phaseStartRef.current = null;
      return undefined;
    }

    if (isUploading) {
      if (phase !== "uploading") {
        setPhase("uploading");
      }
      phaseStartRef.current = null;
      const clamped = Math.max(0, Math.min(100, uploadProgress));
      const next = (clamped / 100) * 30;
      setPercent((prev) => Math.max(prev, next));
      return undefined;
    }

    if (isOcrPending) {
      if (phase !== "recognizing") {
        setPhase("recognizing");
        phaseStartRef.current = Date.now();
        setPercent((prev) => Math.max(prev, RECOGNIZING_START));
      }
      return undefined;
    }

    if (isSaving) {
      if (phase !== "saving") {
        setPhase("saving");
        phaseStartRef.current = Date.now();
        setPercent((prev) => Math.max(prev, RECOGNIZING_START));
      }
      return undefined;
    }

    // 업로드/OCR/저장 모두 종료. 직전이 진행 중이었다면 done 으로 마무리.
    if (phase === "uploading" || phase === "recognizing" || phase === "saving") {
      // 인식이 빨리 끝나서 percent 가 아직 95% 미만이면, "30→100" 같은 큰
      // 점프 대신 즉시 95% 로 스냅한 뒤 PHASE_GRACE_MS 후 100% 로 마무리한다.
      // 요구사항: "응답 도착 시 100%, 단 항상 95→100 마무리".
      setPercent((prev) => Math.max(prev, RECOGNIZING_TARGET));
      // 단계 전환 시점에 잠시 양쪽 신호가 모두 false 가 되는 경우(상태 업데이트
      // 분리 등)를 흡수하기 위해 짧게 대기 후 done 으로 전환한다.
      const t = window.setTimeout(() => {
        setPhase("done");
        setPercent(100);
        phaseStartRef.current = null;
      }, PHASE_GRACE_MS);
      return () => window.clearTimeout(t);
    }

    return undefined;
  }, [isUploading, uploadProgress, isOcrPending, isSaving, isError, phase]);

  // 인식/저장 구간 시간 기반 ease-out 애니메이션. 점점 느려지는 곡선으로
  // 95% 에 정확히 수렴(t=1 일 때 normalizer 로 정규화).
  useEffect(() => {
    if (phase !== "recognizing" && phase !== "saving") return;
    let raf = 0;
    const tick = () => {
      const start = phaseStartRef.current;
      if (start == null) return;
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / RECOGNITION_DURATION_MS);
      const eased = (1 - Math.exp(-EASE_K * t)) / EASE_NORMALIZER; // 0..1, 정확히 1 도달
      const next = RECOGNIZING_START + eased * (RECOGNIZING_TARGET - RECOGNIZING_START);
      setPercent((prev) => Math.max(prev, Math.min(RECOGNIZING_TARGET, next)));
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [phase]);

  // done → idle 자동 리셋.
  useEffect(() => {
    if (phase !== "done") return;
    const t = window.setTimeout(() => {
      setPhase("idle");
      setPercent(0);
    }, DONE_HOLD_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  const intPercent = Math.round(percent);
  let label = "";
  if (phase === "uploading") label = `사진 업로드 중 ${intPercent}%`;
  else if (phase === "recognizing") label = `AI가 글자 인식 중 ${intPercent}%`;
  else if (phase === "saving") label = `${savingLabel ?? "저장 중"} ${intPercent}%`;
  else if (phase === "done") label = `완료 ${intPercent}%`;

  return {
    percent: intPercent,
    phase,
    label,
    active: phase !== "idle",
  };
}
