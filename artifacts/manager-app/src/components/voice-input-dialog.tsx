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
  const finalTextRef = useRef("");
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
      const merged = (finalTextRef.current + "").trim();
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

    rec.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          const sep = finalTextRef.current && !finalTextRef.current.endsWith(" ") ? " " : "";
          finalTextRef.current = finalTextRef.current + sep + transcript.trim();
          setFinalText(finalTextRef.current);
        } else {
          interim += transcript;
        }
      }
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
  testId?: string;
}

export function VoiceInputButton({
  onInsert,
  title,
  ariaLabel = "음성으로 입력",
  className,
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
        <Mic className="w-4 h-4" />
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
