// [Task #611] 결재 라인 — 서명본 업로드 컴포넌트.
//
// 본부장 / 관리인의 오프라인(인쇄+서명+사진/PDF) 결재가 필수가 되면서
// 한 결재 단계마다 "서명본" 첨부가 강제된다. 이 컴포넌트는 4가지 업로드
// 진입(드래그·드롭 / 파일 피커 / 카메라 / 갤러리)을 모두 한 화면에서
// 처리하고, 서버에 어느 경로로 들어왔는지(`uploadMethod`)를 함께 보낸다.
//
// 흐름: 파일 → /api/storage(객체 스토리지 업로드) → /api/approvals/:id/steps/:stepId/signed-copies
//   서버는 같은 단계의 첨부 파일들을 누적 보관하며, 최소 한 장이 들어오면
//   `signedCopyMissing` 플래그가 풀린다.
//
// [Task #611 fix] 다중 페이지 첨부 지원:
//   여러 장으로 구성된 결재본은 페이지를 추가해 누적 업로드한다. 각 페이지마다
//   "교체"가 가능하며, 새 페이지는 기존 페이지 번호 + 1 로 자동 부여된다.
import { useRef, useState } from "react";
import { Camera, FileImage, Image as ImageIcon, Plus, RefreshCcw, UploadCloud } from "lucide-react";
import { useUpload } from "@workspace/object-storage-web";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";

export type SignedCopyKind = "offline_scan" | "electronic_pdf";

export type UploadMethod = "drag_drop" | "file_picker" | "camera" | "gallery";

export interface SignedCopySummary {
  id: number;
  approvalId: number;
  stepId: number;
  pageNumber: number;
  fileName: string;
  fileUrl: string;
  mimeType: string | null;
  uploadMethod: UploadMethod;
  kind: SignedCopyKind;
  createdAt: string;
  uploadedByName: string;
}

interface Props {
  approvalId: number;
  stepId: number;
  /** 보통 "offline_scan" — 본부장/관리인 인쇄·서명본. */
  kind?: SignedCopyKind;
  /** 이미 업로드된 서명본 목록(페이지 오름차순 권장). */
  existing?: SignedCopySummary[] | null;
  /** 업로드/교체 성공 후 호출. */
  onUploaded?: (summary: SignedCopySummary) => void;
  disabled?: boolean;
}

export default function SignedCopyUploader({
  approvalId,
  stepId,
  kind = "offline_scan",
  existing,
  onUploaded,
  disabled,
}: Props) {
  const { toast } = useToast();
  const { token } = useAuth();
  const filePickerRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingMethod, setPendingMethod] = useState<UploadMethod | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string | null>(null);
  const [pendingMime, setPendingMime] = useState<string | null>(null);
  // null = "새 페이지 추가". 숫자 = 해당 copyId 교체.
  const [replaceTargetId, setReplaceTargetId] = useState<number | null>(null);

  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");

  const pages = (existing ?? []).slice().sort((a, b) => a.pageNumber - b.pageNumber);
  const nextPageNumber = pages.length > 0 ? Math.max(...pages.map((p) => p.pageNumber)) + 1 : 1;

  const { uploadFile, isUploading, progress } = useUpload({
    basePath: `${apiBase}/storage`,
    authToken: token,
    onSuccess: async (response) => {
      try {
        const fileUrl = `${apiBase}/storage${response.objectPath}`;
        const isReplace = replaceTargetId !== null;
        const url = isReplace
          ? `${apiBase}/approvals/${approvalId}/steps/${stepId}/signed-copies/${replaceTargetId}/replace`
          : `${apiBase}/approvals/${approvalId}/steps/${stepId}/signed-copies`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            fileUrl,
            fileName: pendingFileName ?? "signed-copy",
            mimeType: pendingMime,
            uploadMethod: pendingMethod ?? "file_picker",
            kind,
            ...(isReplace
              ? { replaceReason: "잘못 첨부된 파일 교체" }
              : { pageNumber: nextPageNumber }),
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error ?? `등록 실패 (${res.status})`);
        }
        const summary: SignedCopySummary = await res.json();
        toast({ title: isReplace ? "서명본 교체 완료" : `${summary.pageNumber}페이지 업로드 완료` });
        onUploaded?.(summary);
      } catch (e) {
        toast({
          title: "서명본 등록 실패",
          description: e instanceof Error ? e.message : "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
      } finally {
        setPendingMethod(null);
        setPendingFileName(null);
        setPendingMime(null);
        setReplaceTargetId(null);
      }
    },
    onError: (err) => {
      toast({
        title: "파일 업로드 실패",
        description: err instanceof Error ? err.message : "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
      setPendingMethod(null);
      setPendingFileName(null);
      setPendingMime(null);
      setReplaceTargetId(null);
    },
  });

  const upload = (file: File, method: UploadMethod) => {
    if (disabled || isUploading) return;
    setPendingMethod(method);
    setPendingFileName(file.name);
    setPendingMime(file.type || "application/octet-stream");
    uploadFile(file);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>, method: UploadMethod) => {
    const f = e.target.files?.[0];
    if (f) upload(f, method);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) {
      setReplaceTargetId(null);
      upload(f, "drag_drop");
    }
  };

  const triggerAddPage = () => {
    setReplaceTargetId(null);
    filePickerRef.current?.click();
  };

  const triggerReplace = (copyId: number) => {
    setReplaceTargetId(copyId);
    filePickerRef.current?.click();
  };

  return (
    <div className="space-y-3" data-testid="signed-copy-uploader">
      <input
        ref={filePickerRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => onFile(e, "file_picker")}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onFile(e, "camera")}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onFile(e, "gallery")}
      />

      {pages.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-emerald-900">
            첨부된 서명본 {pages.length}장
          </p>
          {pages.map((page) => (
            <div
              key={page.id}
              className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm"
              data-testid={`signed-copy-page-${page.pageNumber}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <FileImage className="mt-0.5 h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="font-medium text-emerald-900">
                      {page.pageNumber}페이지
                    </p>
                    <p className="break-all text-xs text-emerald-800">
                      {page.fileName} · {methodLabel(page.uploadMethod)} ·{" "}
                      {page.uploadedByName}
                    </p>
                    <a
                      href={page.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-emerald-700 underline"
                    >
                      파일 열기
                    </a>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => triggerReplace(page.id)}
                  disabled={disabled || isUploading}
                  data-testid={`btn-replace-page-${page.pageNumber}`}
                >
                  <RefreshCcw className="mr-1 h-3 w-3" /> 교체
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={triggerAddPage}
            disabled={disabled || isUploading}
            data-testid="btn-add-page"
          >
            <Plus className="mr-1 h-4 w-4" /> {nextPageNumber}페이지 추가
          </Button>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={onDrop}
          className={[
            "flex flex-col items-center justify-center rounded-md border-2 border-dashed p-4 text-center text-sm",
            isDragOver
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 bg-gray-50",
          ].join(" ")}
        >
          <UploadCloud className="mb-2 h-6 w-6 text-gray-400" />
          <p className="font-medium text-gray-700">
            인쇄·서명한 결재본을 첨부하세요
          </p>
          <p className="text-xs text-gray-500">
            드래그·드롭 또는 아래 버튼으로 업로드 — 여러 페이지 누적 가능 (JPG·PNG·PDF)
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={triggerAddPage}
          disabled={disabled || isUploading}
        >
          <UploadCloud className="mr-1 h-4 w-4" /> 파일
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setReplaceTargetId(null);
            cameraRef.current?.click();
          }}
          disabled={disabled || isUploading}
        >
          <Camera className="mr-1 h-4 w-4" /> 촬영
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setReplaceTargetId(null);
            galleryRef.current?.click();
          }}
          disabled={disabled || isUploading}
        >
          <ImageIcon className="mr-1 h-4 w-4" /> 갤러리
        </Button>
      </div>
      {isUploading ? (
        <p className="text-xs text-gray-500">
          업로드 중… {Math.round(progress)}%
        </p>
      ) : null}
    </div>
  );
}

function methodLabel(m: UploadMethod): string {
  switch (m) {
    case "drag_drop":
      return "드래그·드롭";
    case "file_picker":
      return "파일 선택";
    case "camera":
      return "촬영";
    case "gallery":
      return "갤러리";
    default:
      return m;
  }
}
