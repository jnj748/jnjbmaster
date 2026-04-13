import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/contexts/auth-context";

interface AuthImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

export function AuthImage({ src, alt, ...props }: AuthImageProps) {
  const { token } = useAuth();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!src || !token) return;

    if (!src.includes("/storage/objects/")) {
      setBlobUrl(src);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    fetch(src, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (!cancelled) {
          const url = URL.createObjectURL(blob);
          blobUrlRef.current = url;
          setBlobUrl(url);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      controller.abort();
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [src, token]);

  if (!blobUrl) return null;

  return <img src={blobUrl} alt={alt} {...props} />;
}
