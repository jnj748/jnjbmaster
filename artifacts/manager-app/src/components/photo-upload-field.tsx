import { useState, useRef } from "react";
import { useUpload } from "@workspace/object-storage-web";
import { useAuth } from "@/contexts/auth-context";
import { authedImageUrl } from "@/lib/authed-image-url";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Camera, X, Loader2, ImageIcon } from "lucide-react";

interface PhotoUploadFieldProps {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
}

export function PhotoUploadField({ label, value, onChange }: PhotoUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { token } = useAuth();
  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");

  const { uploadFile, isUploading, progress } = useUpload({
    basePath: `${apiBase}/storage`,
    authToken: token,
    onSuccess: (response) => {
      const servingUrl = `${apiBase}/storage${response.objectPath}`;
      onChange(servingUrl);
    },
    onError: () => {},
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
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
          <img
            src={authedImageUrl(value, token)}
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
            capture="environment"
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
