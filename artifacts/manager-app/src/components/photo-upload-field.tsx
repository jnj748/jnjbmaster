import { useRef } from "react";
import { useUpload } from "@workspace/object-storage-web";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { AuthImage } from "@/components/auth-image";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Camera, X, Loader2 } from "lucide-react";

interface PhotoUploadFieldProps {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
}

const MAX_FILE_SIZE_MB = 20;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export function PhotoUploadField({ label, value, onChange }: PhotoUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {value ? (
        <div className="relative inline-block">
          <AuthImage
            src={value}
            alt={label}
            className="w-full max-w-[200px] h-auto rounded-lg border object-cover"
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full h-20 flex flex-col gap-1 border-dashed"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-xs">{progress}%</span>
              </>
            ) : (
              <>
                <Camera className="w-5 h-5" />
                <span className="text-xs">촬영 또는 선택</span>
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
