import { useState } from "react";
import { useUpload } from "@workspace/object-storage-web";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { AuthImage } from "@/components/auth-image";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  AttachmentPickerSheet,
  type AttachmentPickerFileOption,
} from "@/components/attachment-picker-sheet";
import { Camera, X, Loader2 } from "lucide-react";

interface PhotoUploadFieldProps {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
  /**
   * Optional test id prefix; the trigger button gets `${testId}-trigger`,
   * the remove button gets `${testId}-remove`, and the picker sheet inputs
   * are forwarded as `${testId}-camera-input` / `${testId}-gallery-input` /
   * `${testId}-file-input` (when fileOption is set).
   */
  testId?: string;
  /**
   * [Task #412] true 면 미리보기와 트리거 버튼 모두 작은 정사각 썸네일로 렌더링한다.
   * 모바일 ‘업무기록’ 다이얼로그처럼 좁은 공간에 사진 입력을 2개 나란히 배치할 때 사용.
   */
  compact?: boolean;
  /**
   * [Task #458] true 면 사진 트리거(촬영/선택)와 삭제(X) 버튼을 비활성화해 읽기 전용으로 표시한다.
   * 건물정보 수정 화면처럼 편집 가드가 있는 화면에서, 편집 모드가 아닐 때 사용한다.
   */
  disabled?: boolean;
}

const MAX_FILE_SIZE_MB = 20;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export function PhotoUploadField({ label, value, onChange, testId, compact = false, disabled = false }: PhotoUploadFieldProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  // [Task #538] 드래그 중인 상태를 추적해 드롭 영역을 시각적으로 강조한다.
  //   dragenter/dragover 가 자식 요소 위에서 반복 발화하므로 단순 boolean 으로 충분.
  const [isDragOver, setIsDragOver] = useState(false);
  const { token } = useAuth();
  const { toast } = useToast();
  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");

  const { uploadFile, isUploading, progress } = useUpload({
    basePath: `${apiBase}/storage`,
    authToken: token,
    onSuccess: (response) => {
      const servingUrl = `${apiBase}/storage${response.objectPath}`;
      onChange(servingUrl);
    },
    onError: (err) => {
      console.error("[PhotoUploadField] upload failed:", err);
      const message =
        err instanceof Error && err.message
          ? err.message
          : "사진 업로드에 실패했습니다. 다시 시도해주세요.";
      toast({
        title: "사진 업로드 실패",
        description: message,
        variant: "destructive",
      });
    },
  });

  function handlePick(file: File) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast({
        title: "사진 용량이 너무 큽니다",
        description: `최대 ${MAX_FILE_SIZE_MB}MB까지 업로드할 수 있습니다. 사진을 줄여서 다시 시도해주세요.`,
        variant: "destructive",
      });
      return;
    }
    uploadFile(file);
  }

  function handleRemove() {
    onChange(null);
  }

  // [Task #538] 드래그 앤 드롭 핸들러 모음.
  //   - 파일 드래그라면 disabled/업로드 중이라도 항상 preventDefault 한다 —
  //     그러지 않으면 브라우저 기본 동작(현재 탭에서 파일 열기) 으로 사용자가
  //     작성 중인 화면을 잃게 된다. disabled 일 때는 강조/업로드만 건너뛴다.
  //   - drop 시 dataTransfer.files 의 첫 번째 파일만 사용 (이 필드는 단일 이미지).
  //   - 이미지가 아닌 MIME 타입은 토스트로 안내 후 무시.
  const dropDisabled = disabled || isUploading;
  const isFileDrag = (e: React.DragEvent<HTMLDivElement>) =>
    Array.from(e.dataTransfer.types).includes("Files");

  function handleDragEnter(e: React.DragEvent<HTMLDivElement>) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (dropDisabled) return;
    setIsDragOver(true);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (!isFileDrag(e)) return;
    // dragover 의 기본 동작을 막아야 drop 이벤트가 발화한다.
    // disabled 일 때도 preventDefault 해 브라우저가 파일을 새 탭으로 열지
    // 않도록 한다.
    e.preventDefault();
    e.stopPropagation();
    if (dropDisabled) {
      e.dataTransfer.dropEffect = "none";
      return;
    }
    e.dataTransfer.dropEffect = "copy";
    if (!isDragOver) setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (dropDisabled) return;
    // currentTarget 바깥으로 완전히 빠져나갔을 때만 강조 해제 — 자식 요소 위로
    // 마우스가 이동하면서 발화하는 leave 는 무시한다.
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    if (!isFileDrag(e)) return;
    // 파일 드롭은 disabled/업로드 중이어도 반드시 막아야 브라우저가 파일을
    // 새 탭으로 열지 않는다. 이후 disabled 면 조용히 무시.
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (dropDisabled) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({
        title: "이미지 파일만 업로드할 수 있습니다",
        description: "PNG, JPG 등 이미지 파일을 끌어다 놓아주세요.",
        variant: "destructive",
      });
      return;
    }
    handlePick(file);
  }

  // PhotoUploadField 는 단일 이미지 결과(value: string | null)를 다루므로
  // 시트의 "파일에서 선택"(PDF 등) 옵션은 노출하지 않는다. PDF 혼용 자리는
  // AttachmentPickerSheet 를 직접 사용해 호출측에서 PDF 결과를 다룬다.
  const fileOption: AttachmentPickerFileOption | undefined = undefined;

  // [Task #538] 드래그 중일 때만 추가되는 강조 클래스. 트리거(점선)와
  //   미리보기(실선) 모두에 적용해 드롭 위치가 어느 칸인지 분명히 보인다.
  const dragHighlight = isDragOver
    ? "ring-2 ring-primary ring-offset-1 bg-primary/5"
    : "";

  return (
    <div
      className={`space-y-1.5 rounded-lg transition-colors ${dragHighlight}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-testid={testId ? `${testId}-dropzone` : undefined}
      data-drag-over={isDragOver ? "true" : "false"}
    >
      <Label className="text-xs font-medium">{label}</Label>
      {value ? (
        <div className="relative inline-block">
          <AuthImage
            src={value}
            alt={label}
            className={
              compact
                ? "w-24 h-24 rounded-lg border object-cover"
                : "w-full max-w-[200px] h-auto rounded-lg border object-cover"
            }
          />
          <button
            type="button"
            onClick={handleRemove}
            aria-label="삭제"
            disabled={disabled}
            className="absolute -top-1.5 -right-1.5 w-7 h-7 flex items-center justify-center bg-transparent p-0 disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid={testId ? `${testId}-remove` : undefined}
          >
            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-destructive text-destructive-foreground shadow-sm">
              <X className="w-2.5 h-2.5" strokeWidth={3} />
            </span>
          </button>
        </div>
      ) : (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={
              compact
                ? `w-24 h-24 flex flex-col gap-1 border-dashed p-0 ${isDragOver ? "border-primary border-solid" : ""}`
                : `w-full h-20 flex flex-col gap-1 border-dashed ${isDragOver ? "border-primary border-solid" : ""}`
            }
            onClick={() => setPickerOpen(true)}
            disabled={isUploading || disabled}
            data-testid={testId ? `${testId}-trigger` : undefined}
          >
            {isUploading ? (
              <>
                <Loader2 className={compact ? "w-4 h-4 animate-spin" : "w-5 h-5 animate-spin"} />
                <span className="text-xs">{progress}%</span>
              </>
            ) : isDragOver ? (
              <>
                <Camera className={compact ? "w-4 h-4 text-primary" : "w-5 h-5 text-primary"} />
                <span className="text-[11px] leading-tight text-primary">여기에 놓기</span>
              </>
            ) : (
              <>
                <Camera className={compact ? "w-4 h-4" : "w-5 h-5"} />
                <span className="text-[11px] leading-tight">촬영 또는 선택</span>
              </>
            )}
          </Button>
        </div>
      )}

      <AttachmentPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="사진 추가"
        onPick={handlePick}
        fileOption={fileOption}
        testId={testId ?? "photo"}
      />
    </div>
  );
}
