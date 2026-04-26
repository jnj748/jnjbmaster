import { useRef, useState } from "react";
import { useUpload } from "@workspace/object-storage-web";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { AuthImage } from "@/components/auth-image";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Camera, X, Loader2, ImagePlus } from "lucide-react";

interface PhotoUploadFieldProps {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
  /**
   * Optional test id prefix; the camera input gets `${testId}-camera-input`,
   * the gallery input gets `${testId}-gallery-input`, and the trigger button
   * gets `${testId}-trigger`. Useful for e2e tests that need to target
   * specific upload fields.
   */
  testId?: string;
  /**
   * [Task #412] true 면 미리보기와 트리거 버튼 모두 작은 정사각 썸네일로 렌더링한다.
   * 모바일 ‘업무기록’ 다이얼로그처럼 좁은 공간에 사진 입력을 2개 나란히 배치할 때 사용.
   */
  compact?: boolean;
}

const MAX_FILE_SIZE_MB = 20;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export function PhotoUploadField({ label, value, onChange, testId, compact = false }: PhotoUploadFieldProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // [Task #413] 시트 스와이프-다운 닫기용 터치 좌표 추적.
  const swipeStartYRef = useRef<number | null>(null);
  const swipeDeltaRef = useRef<number>(0);

  function handleSheetTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    swipeStartYRef.current = e.touches[0]?.clientY ?? null;
    swipeDeltaRef.current = 0;
  }
  function handleSheetTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    const start = swipeStartYRef.current;
    if (start == null) return;
    const y = e.touches[0]?.clientY ?? start;
    swipeDeltaRef.current = y - start;
  }
  function handleSheetTouchEnd() {
    if (swipeDeltaRef.current > 60) {
      setPickerOpen(false);
    }
    swipeStartYRef.current = null;
    swipeDeltaRef.current = 0;
  }
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast({
          title: "사진 용량이 너무 큽니다",
          description: `최대 ${MAX_FILE_SIZE_MB}MB까지 업로드할 수 있습니다. 사진을 줄여서 다시 시도해주세요.`,
          variant: "destructive",
        });
        e.target.value = "";
        return;
      }
      uploadFile(file);
    }
    e.target.value = "";
  }

  function handleRemove() {
    onChange(null);
  }

  function pickCamera() {
    setPickerOpen(false);
    // 약간의 지연으로 시트 닫힘 애니메이션과 파일 다이얼로그가 충돌하지 않게 한다.
    setTimeout(() => cameraInputRef.current?.click(), 50);
  }

  function pickGallery() {
    setPickerOpen(false);
    setTimeout(() => galleryInputRef.current?.click(), 50);
  }

  return (
    <div className="space-y-1.5">
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
            className="absolute -top-1.5 -right-1.5 w-7 h-7 flex items-center justify-center bg-transparent p-0"
            data-testid={testId ? `${testId}-remove` : undefined}
          >
            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-destructive text-destructive-foreground shadow-sm">
              <X className="w-2.5 h-2.5" strokeWidth={3} />
            </span>
          </button>
        </div>
      ) : (
        <div>
          {/* 후면 카메라 우선 호출. capture="environment"가 모바일 브라우저에서 카메라 앱을 직접 띄운다. */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
            data-testid={testId ? `${testId}-camera-input` : undefined}
          />
          {/* 일반 이미지 선택. capture 속성이 없으면 사진 앨범이 우선된다. */}
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
            data-testid={testId ? `${testId}-gallery-input` : undefined}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={
              compact
                ? "w-24 h-24 flex flex-col gap-1 border-dashed p-0"
                : "w-full h-20 flex flex-col gap-1 border-dashed"
            }
            onClick={() => setPickerOpen(true)}
            disabled={isUploading}
            data-testid={testId ? `${testId}-trigger` : undefined}
          >
            {isUploading ? (
              <>
                <Loader2 className={compact ? "w-4 h-4 animate-spin" : "w-5 h-5 animate-spin"} />
                <span className="text-xs">{progress}%</span>
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

      <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl pt-3"
          hideClose
          onTouchStart={handleSheetTouchStart}
          onTouchMove={handleSheetTouchMove}
          onTouchEnd={handleSheetTouchEnd}
        >
          {/* 스와이프-다운 핸들(시각적 어포던스). 영역외 터치/스와이프-다운/취소 버튼으로 닫힌다. */}
          <div
            aria-hidden
            className="mx-auto -mt-1 mb-2 h-1.5 w-10 rounded-full bg-slate-300"
          />
          <SheetHeader>
            <SheetTitle className="text-left">사진 추가</SheetTitle>
          </SheetHeader>
          <div className="grid gap-2 py-4">
            <Button
              type="button"
              variant="outline"
              className="w-full h-14 justify-start gap-3 text-base"
              onClick={pickCamera}
              data-testid={testId ? `${testId}-pick-camera` : "photo-pick-camera"}
            >
              <Camera className="w-5 h-5" />
              촬영
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full h-14 justify-start gap-3 text-base"
              onClick={pickGallery}
              data-testid={testId ? `${testId}-pick-gallery` : "photo-pick-gallery"}
            >
              <ImagePlus className="w-5 h-5" />
              앨범에서 선택
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full h-12"
              onClick={() => setPickerOpen(false)}
            >
              취소
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
