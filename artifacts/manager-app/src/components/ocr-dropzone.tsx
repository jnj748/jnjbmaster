// [Task #745] 협력업체 등록 다이얼로그용 드래그앤드롭 OCR 업로더.
//
// PhotoUploadField 와 달리 PDF·이미지 모두 받아 OCR 미리보기를 트리거한다.
// 업로드 자체는 useUpload 훅을 그대로 재사용하고(`/api/storage/uploads/...`),
// 업로드 완료 후 콜백으로 objectPath / fileName / fileUrl 을 호출측에 넘긴다.
// OCR 호출은 호출측이 책임진다(다이얼로그가 두 개의 드롭존을 한 컴포넌트에서
// 다루므로 OCR 머지 규칙은 드롭존 바깥에 둔다).
//
// 상태 표시:
//  - idle: 점선 박스 + 안내 문구
//  - uploading: 진행률 표시
//  - ocr-processing: 호출측이 isProcessing prop 으로 제어
//  - done: 파일명 + 다시올리기 / 제거 버튼
//  - error: 에러 메시지 + 다시올리기

import { useRef, useState } from "react";
import { useUpload } from "@workspace/object-storage-web";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, UploadCloud, FileText, X, AlertCircle, CheckCircle2 } from "lucide-react";

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export interface OcrDropzoneValue {
  objectPath: string;
  fileName: string;
  fileUrl: string;
}

export interface OcrDropzoneProps {
  label: string;
  description?: string;
  value: OcrDropzoneValue | null;
  onUploaded: (v: OcrDropzoneValue) => void;
  onCleared: () => void;
  /** 업로드 직후 호출측이 OCR 호출 중임을 표시하기 위한 외부 상태. */
  isProcessing?: boolean;
  /**
   * [Task #745] 호출측에서 OCR 미리보기 호출이 실패했을 때 인라인 에러 문구로
   * 표시하기 위한 외부 상태. (네트워크/권한/Gemini 실패 등)
   */
  processingError?: string | null;
  testId?: string;
  disabled?: boolean;
}

export function OcrDropzone({
  label,
  description,
  value,
  onUploaded,
  onCleared,
  isProcessing = false,
  processingError = null,
  testId,
  disabled = false,
}: OcrDropzoneProps) {
  const { token } = useAuth();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");

  // useUpload 의 onSuccess 콜백은 파일명을 직접 노출하지 않으므로,
  // 업로드 직전에 fileName 을 저장해두고 콜백에서 합쳐 넘긴다.
  const lastFileNameRef = useRef<string>("");
  const { uploadFile, isUploading, progress } = useUpload({
    basePath: `${apiBase}/storage`,
    authToken: token,
    onSuccess: (response) => {
      const fileUrl = `${apiBase}/storage${response.objectPath}`;
      onUploaded({
        objectPath: response.objectPath,
        fileName: lastFileNameRef.current || "uploaded-file",
        fileUrl,
      });
    },
    onError: (err) => {
      const message = err instanceof Error && err.message ? err.message : "업로드에 실패했습니다.";
      setError(message);
      toast({ title: "업로드 실패", description: message, variant: "destructive" });
    },
  });

  function validate(file: File): string | null {
    if (!ALLOWED_MIME.has(file.type)) {
      return "지원하지 않는 파일 형식입니다 (PDF/JPEG/PNG/WEBP/HEIC만 허용)";
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return `파일이 너무 큽니다 (최대 ${MAX_FILE_SIZE_MB}MB)`;
    }
    return null;
  }

  function handleFile(file: File) {
    setError(null);
    const v = validate(file);
    if (v) {
      setError(v);
      toast({ title: "파일을 처리할 수 없습니다", description: v, variant: "destructive" });
      return;
    }
    lastFileNameRef.current = file.name;
    uploadFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) handleFile(file);
  }

  const dropDisabled = disabled || isUploading || isProcessing;
  const isFileDrag = (e: React.DragEvent<HTMLDivElement>) =>
    Array.from(e.dataTransfer.types).includes("Files");

  function handleDragEnter(e: React.DragEvent<HTMLDivElement>) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!dropDisabled) setIsDragOver(true);
  }
  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (!isFileDrag(e)) return;
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
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setIsDragOver(false);
  }
  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (dropDisabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  const tid = (s: string) => (testId ? `${testId}-${s}` : undefined);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-testid={tid("dropzone")}
        data-drag-over={isDragOver ? "true" : "false"}
        className={[
          "relative rounded-lg border-2 border-dashed p-3 transition-colors",
          isDragOver ? "border-primary bg-primary/5" : "border-input",
          dropDisabled ? "opacity-70" : "",
        ].join(" ")}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="hidden"
          onChange={handleInputChange}
          data-testid={tid("file-input")}
        />

        {value && !isUploading ? (
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate" data-testid={tid("file-name")}>
                {value.fileName}
              </div>
              {isProcessing ? (
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> OCR 분석 중…
                </div>
              ) : (
                <div className="flex items-center gap-1 text-[11px] text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" /> 업로드 완료
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={dropDisabled}
              data-testid={tid("replace")}
            >
              교체
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="삭제"
              onClick={() => {
                setError(null);
                onCleared();
              }}
              disabled={disabled || isProcessing}
              data-testid={tid("remove")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : isUploading ? (
          <div className="flex flex-col items-center justify-center gap-1 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span>업로드 중… {progress}%</span>
          </div>
        ) : (
          <button
            type="button"
            className="w-full flex flex-col items-center justify-center gap-1 py-4 text-center disabled:cursor-not-allowed"
            onClick={() => inputRef.current?.click()}
            disabled={dropDisabled}
            data-testid={tid("trigger")}
          >
            <UploadCloud className={`h-6 w-6 ${isDragOver ? "text-primary" : "text-muted-foreground"}`} />
            <span className={`text-sm ${isDragOver ? "text-primary" : "text-foreground"}`}>
              {isDragOver ? "여기에 놓기" : "파일을 끌어다 놓거나 클릭해서 선택"}
            </span>
            <span className="text-[11px] text-muted-foreground">
              PDF / JPG / PNG / WEBP / HEIC · 최대 {MAX_FILE_SIZE_MB}MB
            </span>
          </button>
        )}
      </div>
      {description && !error && !processingError && (
        <p className="text-[11px] text-muted-foreground">{description}</p>
      )}
      {error && (
        <p
          className="flex items-center gap-1 text-[11px] text-destructive"
          data-testid={tid("error")}
        >
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}
      {!error && processingError && (
        <p
          className="flex items-center gap-1 text-[11px] text-destructive"
          data-testid={tid("processing-error")}
        >
          <AlertCircle className="h-3 w-3" /> {processingError}
        </p>
      )}
    </div>
  );
}
