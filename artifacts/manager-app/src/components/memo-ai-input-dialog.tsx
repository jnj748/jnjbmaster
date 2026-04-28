// [Task #465] 메모 AI입력 — 카메라/사진첩에서 메모 사진을 골라 OCR 한 뒤
// 결과를 미리보기/편집 후 호출측 onInsert 콜백으로 전달한다.
//
// 사용 흐름:
//   1) 사용자가 "메모 AI입력" 버튼을 누르면 공용 첨부 시트가 열린다
//      (촬영 / 앨범에서 선택 / 파일에서 선택).
//   2) 파일 선택 → 오브젝트 스토리지로 업로드 → POST /memos/ocr 로 OCR.
//   3) 인식 결과를 텍스트영역으로 보여주고, "메모에 추가"를 누르면
//      onInsert(text) 콜백으로 호출측이 기존 메모 끝에 줄바꿈으로 이어 붙인다
//      (VoiceInputDialog 와 같은 누적 UX).
//
// 어떤 입력 수단(타이핑/음성/AI입력)을 쓰든 결과가 같은 메모 state 한 곳에
// 누적되도록, 본 컴포넌트는 메모 state 자체는 들고 있지 않고 콜백만 호출한다.
//
// [Task #507] 자체 시트 + 두 개의 hidden input 패턴을 공용 AttachmentPickerSheet
// 으로 교체한다. 이미지+PDF 혼용 자리이므로 fileOption(application/pdf)으로
// 세 번째 항목을 추가한다.

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useUpload } from "@workspace/object-storage-web";
import { useRunMemoOcr } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { OcrProgressBar } from "@/components/ocr-progress-bar";
import { AttachmentPickerSheet } from "@/components/attachment-picker-sheet";
import { cn } from "@/lib/utils";

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

interface MemoAiInputButtonProps {
  onInsert: (text: string) => void;
  /**
   * data-testid 접두사. 버튼/시트 항목/다이얼로그에 일관된 testid 가 붙는다.
   * 예) "fab-memo-ai" → fab-memo-ai-trigger / fab-memo-ai-confirm 등.
   */
  testId?: string;
  /** "메모 AI입력" 버튼에 적용할 추가 클래스 (예: 너비 조정). */
  className?: string;
}

export function MemoAiInputButton({ onInsert, testId, className }: MemoAiInputButtonProps) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [resultText, setResultText] = useState("");
  const [pendingFileName, setPendingFileName] = useState<string | null>(null);
  // [Task #472] 가로 진행바를 실패 시 즉시 숨기기 위한 신호.
  const [ocrError, setOcrError] = useState(false);

  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");

  const ocrMutation = useRunMemoOcr();

  const { uploadFile, isUploading, progress } = useUpload({
    basePath: `${apiBase}/storage`,
    authToken: token,
    onSuccess: async (response) => {
      try {
        const result = await ocrMutation.mutateAsync({
          data: {
            objectPath: response.objectPath,
            fileName: pendingFileName ?? undefined,
          },
        });
        const text = (result.text ?? "").trim();
        if (!text) {
          // 빈 결과는 사용자 입장에서 "실패" — 가로바도 즉시 숨긴다.
          setOcrError(true);
          toast({
            title: "인식된 메모가 없습니다",
            description: "사진에서 글자를 찾지 못했습니다. 다른 사진으로 다시 시도해주세요.",
            variant: "destructive",
          });
          return;
        }
        setResultText(text);
        setPreviewOpen(true);
      } catch (err) {
        setOcrError(true);
        toast({
          title: "메모 AI입력 실패",
          description: err instanceof Error ? err.message : "OCR 처리 중 오류가 발생했습니다",
          variant: "destructive",
        });
      } finally {
        setPendingFileName(null);
      }
    },
    onError: (err) => {
      setOcrError(true);
      toast({
        title: "사진 업로드 실패",
        description: err instanceof Error ? err.message : "다시 시도해주세요",
        variant: "destructive",
      });
      setPendingFileName(null);
    },
  });

  const busy = isUploading || ocrMutation.isPending;

  function handlePick(file: File) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast({
        title: "사진 용량이 너무 큽니다",
        description: `최대 ${MAX_FILE_SIZE_MB}MB까지 업로드할 수 있습니다.`,
        variant: "destructive",
      });
      return;
    }
    setPendingFileName(file.name);
    setOcrError(false);
    uploadFile(file);
  }

  function handleConfirm() {
    const text = resultText.trim();
    if (text.length > 0) {
      onInsert(text);
    }
    setPreviewOpen(false);
    setResultText("");
  }

  return (
    <>
      <div className={cn("flex flex-col gap-1", className)}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setPickerOpen(true)}
          disabled={busy}
          data-testid={testId ? `${testId}-trigger` : "memo-ai-input-trigger"}
          aria-label="메모 AI입력"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 mr-1" />
          )}
          {busy ? "인식 중..." : "메모 AI입력"}
        </Button>
        <OcrProgressBar
          isUploading={isUploading}
          uploadProgress={progress}
          isOcrPending={ocrMutation.isPending}
          isError={ocrError}
          testId={testId ? `${testId}-progress` : "memo-ai-input-progress"}
        />
      </div>

      <AttachmentPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="메모 사진 선택"
        description="손글씨·인쇄·포스트잇 메모 사진을 올리면 글자만 추출해 메모란에 넣어드려요."
        onPick={handlePick}
        fileOption={{
          accept: "application/pdf",
          label: "파일에서 선택",
          description: "PDF 메모 문서",
        }}
        testId={testId ?? "memo-ai-input"}
      />

      <Dialog
        open={previewOpen}
        onOpenChange={(v) => {
          setPreviewOpen(v);
          if (!v) setResultText("");
        }}
      >
        <DialogContent
          className="max-w-md"
          data-testid={testId ? `${testId}-preview-dialog` : "memo-ai-input-preview"}
        >
          <DialogHeader>
            <DialogTitle>메모 AI입력 — 인식 결과</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">
              인식된 텍스트 (직접 수정 가능)
            </label>
            <Textarea
              value={resultText}
              onChange={(e) => setResultText(e.target.value)}
              rows={6}
              placeholder="인식된 메모가 여기에 표시됩니다"
              data-testid={testId ? `${testId}-edit-text` : "memo-ai-input-edit"}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPreviewOpen(false)}
              data-testid={testId ? `${testId}-cancel` : "memo-ai-input-cancel"}
            >
              취소
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={resultText.trim().length === 0}
              data-testid={testId ? `${testId}-confirm` : "memo-ai-input-confirm"}
            >
              메모에 추가
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
