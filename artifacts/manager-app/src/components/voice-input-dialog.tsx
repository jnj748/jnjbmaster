import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const MAX_SECONDS = 60;

// 두 텍스트를 합칠 때 a 의 꼬리와 b 의 머리가 겹치는 부분을 제거한다.
// 예) a="녹음 잘 되는지", b="녹음 잘 되는지 확인하고 싶음"
//   → "녹음 잘 되는지 확인하고 싶음"
// 일부 모바일 인식 엔진이 같은 문장의 점진적 final 결과를 두 번 보고하는 경우의 안전망.
function mergeWithoutOverlap(a: string, b: string): string {
  const left = (a ?? "").trim();
  const right = (b ?? "").trim();
  if (!left) return right;
  if (!right) return left;
  // b 가 a 의 꼬리 어딘가에서 시작하면 그 위치 이후만 붙인다.
  const max = Math.min(left.length, right.length);
  for (let n = max; n > 0; n--) {
    if (left.endsWith(right.slice(0, n))) {
      const tail = right.slice(n).trimStart();
      return tail ? left + (left.endsWith(" ") ? "" : " ") + tail : left;
    }
  }
  return left + (left.endsWith(" ") ? "" : " ") + right;
}

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: any) => void) | null;
  onend: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return (w.SpeechRecognition || w.webkitSpeechRecognition) ?? null;
}

interface VoiceInputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (text: string) => void;
  title?: string;
}

export function VoiceInputDialog({
  open,
  onOpenChange,
  onInsert,
  title = "음성으로 입력",
}: VoiceInputDialogProps) {
  const { toast } = useToast();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [finalText, setFinalText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [editText, setEditText] = useState("");
  const [supported, setSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shouldRestartRef = useRef(false);
  // 전체 누적 텍스트 (committed + 현재 세션 final 의 합).
  const finalTextRef = useRef("");
  // 이전 세션들에서 이미 확정된 텍스트. 새 세션이 시작되면 baseline 이 된다.
  const committedTextRef = useRef("");
  // 현재 세션에서 누적된 final 텍스트 (onresult 마다 통째로 재구성).
  const sessionFinalRef = useRef("");
  const stoppedByUserRef = useRef(false);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopRecognition = useCallback(
    (opts?: { byUser?: boolean; auto?: boolean }) => {
      shouldRestartRef.current = false;
      stoppedByUserRef.current = !!opts?.byUser;
      const rec = recognitionRef.current;
      if (rec) {
        try {
          rec.stop();
        } catch {
          /* noop */
        }
      }
      stopTimer();
      setRecording(false);
      setInterimText("");
      // 마지막 세션의 final 도 committed 로 합쳐서 최종 텍스트 확정.
      if (sessionFinalRef.current) {
        committedTextRef.current = mergeWithoutOverlap(
          committedTextRef.current,
          sessionFinalRef.current,
        );
        sessionFinalRef.current = "";
      }
      finalTextRef.current = committedTextRef.current;
      const merged = finalTextRef.current.trim();
      setFinalText(merged);
      setEditText((prev) => (merged.length > 0 ? merged : prev));
      if (opts?.auto) {
        toast({ title: "최대 60초에 도달하여 자동 종료되었습니다" });
      }
    },
    [stopTimer, toast],
  );

  const startRecognition = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setSupported(false);
      toast({
        title: "이 브라우저는 음성 입력을 지원하지 않습니다",
        description: "최신 Chrome/Edge 브라우저에서 사용해주세요.",
        variant: "destructive",
      });
      return;
    }

    let rec: SpeechRecognitionLike;
    try {
      rec = new Ctor();
    } catch (err) {
      console.error("[VoiceInputDialog] failed to construct recognition", err);
      toast({ title: "음성 인식을 시작할 수 없습니다", variant: "destructive" });
      return;
    }
    rec.lang = "ko-KR";
    rec.continuous = true;
    rec.interimResults = true;

    // [중복방지] 모바일 Chrome 등은 같은 문장을 여러 final 결과로 반복 보고하거나,
    // continuous 모드에서도 짧은 무음마다 세션을 자체 종료/재시작하면서 results 를 리셋한다.
    // → 이벤트마다 인덱스 누적 방식이 아니라, "현재 세션의 final 들을 처음부터 다시 합쳐서"
    //   sessionFinal 로 통째 재구성한다. 그러면 같은 i 에 대해 두 번 add 되는 일이 원천 차단된다.
    // → 세션 종료(onend) 시점에만 sessionFinal 을 committed 에 합치고, 재시작하면 sessionFinal=""에서 시작.
    rec.onresult = (event: any) => {
      let sessionFinal = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript: string = result[0]?.transcript ?? "";
        if (result.isFinal) {
          const cleaned = transcript.trim();
          if (cleaned.length > 0) {
            sessionFinal = sessionFinal
              ? mergeWithoutOverlap(sessionFinal, cleaned)
              : cleaned;
          }
        } else {
          interim += transcript;
        }
      }
      sessionFinalRef.current = sessionFinal;
      const merged = sessionFinal
        ? mergeWithoutOverlap(committedTextRef.current, sessionFinal)
        : committedTextRef.current;
      finalTextRef.current = merged;
      setFinalText(merged);
      setInterimText(interim);
    };

    rec.onerror = (event: any) => {
      const code = event?.error;
      console.warn("[VoiceInputDialog] recognition error", code);
      if (code === "not-allowed" || code === "service-not-allowed") {
        shouldRestartRef.current = false;
        toast({
          title: "마이크 권한이 거부되었습니다",
          description: "브라우저 설정에서 마이크 권한을 허용해주세요.",
          variant: "destructive",
        });
      } else if (code === "no-speech" || code === "audio-capture" || code === "aborted") {
        // 무음/일시 중단 — onend에서 자동 재시작 처리
      } else {
        toast({ title: "음성 인식 오류", description: String(code), variant: "destructive" });
      }
    };

    rec.onend = () => {
      // 세션 종료 시점에만 sessionFinal 을 committed 에 합친다.
      // 이 시점 이후 새 세션이 시작되면 results 가 0 부터 리셋되므로
      // sessionFinal 을 비워야 같은 텍스트가 두 번 누적되지 않는다.
      if (sessionFinalRef.current) {
        committedTextRef.current = mergeWithoutOverlap(
          committedTextRef.current,
          sessionFinalRef.current,
        );
        sessionFinalRef.current = "";
        finalTextRef.current = committedTextRef.current;
        setFinalText(committedTextRef.current);
      }
      // 사용자가 종료하지 않았고 60초 미만이면 자동 재시작 (continuous 모드 보강)
      if (shouldRestartRef.current && !stoppedByUserRef.current) {
        try {
          rec.start();
          return;
        } catch (err) {
          console.warn("[VoiceInputDialog] restart failed", err);
        }
      }
      setRecording(false);
      setInterimText("");
    };

    recognitionRef.current = rec;
    // 사용자가 [시작]을 다시 누르면 직전 commit 텍스트를 baseline 으로 이어쓰기 한다.
    committedTextRef.current = finalText;
    sessionFinalRef.current = "";
    finalTextRef.current = finalText;
    stoppedByUserRef.current = false;
    shouldRestartRef.current = true;

    try {
      rec.start();
    } catch (err) {
      console.error("[VoiceInputDialog] start failed", err);
      toast({ title: "음성 인식을 시작할 수 없습니다", variant: "destructive" });
      return;
    }

    setRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        if (next >= MAX_SECONDS) {
          stopRecognition({ auto: true });
          return MAX_SECONDS;
        }
        return next;
      });
    }, 1000);
  }, [finalText, stopRecognition, toast]);

  // 다이얼로그가 열릴 때 상태 초기화, 닫힐 때 정리
  useEffect(() => {
    if (open) {
      setSupported(!!getSpeechRecognitionCtor());
      setFinalText("");
      finalTextRef.current = "";
      committedTextRef.current = "";
      sessionFinalRef.current = "";
      setInterimText("");
      setEditText("");
      setElapsed(0);
      setRecording(false);
    } else {
      shouldRestartRef.current = false;
      const rec = recognitionRef.current;
      if (rec) {
        try {
          rec.abort();
        } catch {
          /* noop */
        }
      }
      recognitionRef.current = null;
      stopTimer();
      setRecording(false);
    }
  }, [open, stopTimer]);

  useEffect(() => {
    return () => {
      shouldRestartRef.current = false;
      const rec = recognitionRef.current;
      if (rec) {
        try {
          rec.abort();
        } catch {
          /* noop */
        }
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function handleConfirm() {
    const text = editText.trim();
    if (text.length > 0) {
      onInsert(text);
    }
    onOpenChange(false);
  }

  function handleCancel() {
    onOpenChange(false);
  }

  const liveText = (finalText + (interimText ? " " + interimText : "")).trim();
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const maxMm = String(Math.floor(MAX_SECONDS / 60)).padStart(2, "0");
  const maxSs = String(MAX_SECONDS % 60).padStart(2, "0");

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && recording) {
          stopRecognition({ byUser: true });
        }
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md" data-testid="voice-input-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-col items-center justify-center py-4">
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center transition ${
                recording
                  ? "bg-destructive text-destructive-foreground animate-pulse"
                  : "bg-muted text-muted-foreground"
              }`}
              aria-label={recording ? "녹음 중" : "대기 중"}
            >
              <Mic className="w-10 h-10" />
            </div>
            <div className="mt-3 text-sm tabular-nums text-muted-foreground" data-testid="voice-elapsed">
              {mm}:{ss} / {maxMm}:{maxSs}
            </div>
          </div>

          <div className="flex justify-center gap-2">
            <Button
              type="button"
              onClick={startRecognition}
              disabled={recording || !supported}
              data-testid="voice-start"
            >
              <Play className="w-4 h-4 mr-1" />
              시작
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => stopRecognition({ byUser: true })}
              disabled={!recording}
              data-testid="voice-stop"
            >
              <Square className="w-4 h-4 mr-1" />
              종료
            </Button>
          </div>

          {recording ? (
            <div
              className="min-h-[80px] rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap"
              data-testid="voice-live-text"
            >
              {liveText || (
                <span className="text-muted-foreground">말씀해주세요…</span>
              )}
            </div>
          ) : (
            <div>
              <label className="text-xs text-muted-foreground">
                인식된 텍스트 (직접 수정 가능)
              </label>
              <Textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={4}
                placeholder="시작 버튼을 눌러 음성을 입력하세요"
                data-testid="voice-edit-text"
              />
            </div>
          )}

          {!supported && (
            <p className="text-xs text-destructive">
              이 브라우저는 음성 입력을 지원하지 않습니다. 최신 Chrome/Edge에서 사용해주세요.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={handleCancel} data-testid="voice-cancel">
            취소
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={recording || editText.trim().length === 0}
            data-testid="voice-confirm"
          >
            확인
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface VoiceInputButtonProps {
  onInsert: (text: string) => void;
  title?: string;
  ariaLabel?: string;
  className?: string;
  iconClassName?: string;
  testId?: string;
}

export function VoiceInputButton({
  onInsert,
  title,
  ariaLabel = "음성으로 입력",
  className,
  iconClassName,
  testId,
}: VoiceInputButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={className ?? "h-7 w-7"}
        aria-label={ariaLabel}
        onClick={() => setOpen(true)}
        data-testid={testId}
      >
        <Mic className={iconClassName ?? "w-4 h-4"} />
      </Button>
      <VoiceInputDialog
        open={open}
        onOpenChange={setOpen}
        onInsert={(text) => {
          onInsert(text);
          setOpen(false);
        }}
        title={title}
      />
    </>
  );
}
