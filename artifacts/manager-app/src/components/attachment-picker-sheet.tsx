// [Task #507] 사진 첨부 UX 통일을 위한 공용 하단 시트.
//
// 기존 PhotoUploadField 가 가진 "촬영 / 앨범에서 선택" 두 항목 시트 패턴을
// 분리해 재사용 가능한 형태로 만든 공용 컴포넌트.
// 단일 첨부 버튼 + 시트(드롭다운)로 모든 사진 첨부 자리를 통일하기 위해 사용한다.
//
// - 카메라/앨범 입력은 항상 노출.
// - fileOption 을 켜면 "파일에서 선택"(예: PDF·문서) 항목이 추가된다.
//   고지서 OCR / 계약서 첨부 / 입주자 서류 등 이미지+PDF 혼용 자리를 위해
//   기존 PDF 업로드 경로를 끊지 않고 시트 항목으로 보존한다.
// - 카메라 input 은 capture="environment" 로 모바일 후면 카메라를 우선 호출.
// - 시트는 스와이프-다운 제스처로도 닫힌다(원본 PhotoUploadField 와 동일 UX).
//
// 호출측은 onPick(file) 한 콜백만 처리하면 된다. 용량 제한·진행률·실패 토스트 등의
// 로직은 호출측이 그대로 유지한다(검증 위치를 통일하기 위함).

import { useRef } from "react";
import { Camera, FileUp, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export interface AttachmentPickerFileOption {
  /** Hidden file input의 accept 값. 예: "application/pdf" / "image/*,application/pdf" */
  accept: string;
  /** 시트 항목 라벨. 기본값: "파일에서 선택" */
  label?: string;
  /** 라벨 아래 보조 설명. */
  description?: string;
}

export interface AttachmentPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 시트 헤더 제목. 기본값: "사진 추가" */
  title?: string;
  /** 헤더 아래 1줄 안내. */
  description?: string;
  /** 촬영/앨범/파일 모두 동일 콜백으로 단일 파일을 전달. */
  onPick: (file: File) => void;
  /** 활성화 시 "파일에서 선택" 3번째 항목이 추가된다(이미지+PDF 혼용 자리). */
  fileOption?: AttachmentPickerFileOption;
  /** data-testid 접두사. 기본값 없을 때 "attachment-picker"로 폴백. */
  testId?: string;
  /** 카메라/갤러리 항목의 라벨 커스터마이징. */
  cameraLabel?: string;
  galleryLabel?: string;
}

export function AttachmentPickerSheet({
  open,
  onOpenChange,
  title = "사진 추가",
  description,
  onPick,
  fileOption,
  testId,
  cameraLabel = "촬영",
  galleryLabel = "앨범에서 선택",
}: AttachmentPickerSheetProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 스와이프-다운 닫기용 터치 좌표 추적(원본 PhotoUploadField 와 동일).
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
    if (swipeDeltaRef.current > 60) onOpenChange(false);
    swipeStartYRef.current = null;
    swipeDeltaRef.current = 0;
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onPick(file);
  }

  function pick(ref: React.RefObject<HTMLInputElement | null>) {
    onOpenChange(false);
    // 시트 닫힘 애니메이션과 파일 다이얼로그가 충돌하지 않게 약간 지연.
    setTimeout(() => ref.current?.click(), 50);
  }

  const tid = (suffix: string) =>
    testId ? `${testId}-${suffix}` : `attachment-picker-${suffix}`;

  return (
    <>
      {/* 후면 카메라 우선 호출. capture="environment" 가 모바일 브라우저에서 카메라 앱을 직접 띄운다. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        className="hidden"
        data-testid={tid("camera-input")}
      />
      {/* 일반 이미지 선택 — capture 속성이 없으므로 사진 앨범이 우선 노출된다. */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        className="hidden"
        data-testid={tid("gallery-input")}
      />
      {fileOption && (
        <input
          ref={fileInputRef}
          type="file"
          accept={fileOption.accept}
          onChange={handleChange}
          className="hidden"
          data-testid={tid("file-input")}
        />
      )}

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl pt-3"
          hideClose
          onTouchStart={handleSheetTouchStart}
          onTouchMove={handleSheetTouchMove}
          onTouchEnd={handleSheetTouchEnd}
        >
          {/* 스와이프-다운 핸들(시각적 어포던스). */}
          <div
            aria-hidden
            className="mx-auto -mt-1 mb-2 h-1.5 w-10 rounded-full bg-slate-300"
          />
          <SheetHeader>
            <SheetTitle className="text-left">{title}</SheetTitle>
          </SheetHeader>
          {description && (
            <p className="px-1 pt-1 text-xs text-muted-foreground">{description}</p>
          )}
          <div className="grid gap-2 py-4">
            <Button
              type="button"
              variant="outline"
              className="w-full h-14 justify-start gap-3 text-base"
              onClick={() => pick(cameraInputRef)}
              data-testid={tid("pick-camera")}
            >
              <Camera className="w-5 h-5" />
              {cameraLabel}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full h-14 justify-start gap-3 text-base"
              onClick={() => pick(galleryInputRef)}
              data-testid={tid("pick-gallery")}
            >
              <ImagePlus className="w-5 h-5" />
              {galleryLabel}
            </Button>
            {fileOption && (
              <Button
                type="button"
                variant="outline"
                className="w-full h-14 justify-start gap-3 text-base"
                onClick={() => pick(fileInputRef)}
                data-testid={tid("pick-file")}
              >
                <FileUp className="w-5 h-5" />
                <span className="flex flex-col items-start leading-tight">
                  <span>{fileOption.label ?? "파일에서 선택"}</span>
                  {fileOption.description && (
                    <span className="text-[11px] text-muted-foreground">
                      {fileOption.description}
                    </span>
                  )}
                </span>
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              className="w-full h-12"
              onClick={() => onOpenChange(false)}
              data-testid={tid("cancel")}
            >
              취소
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
