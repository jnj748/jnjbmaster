// [Task #661] 파트너(업체) 프로필 아바타 공용 컴포넌트.
//   - profileImageUrl(=storage objectPath) 가 있으면 토큰 기반 AuthImage 로 표시.
//   - 없으면 lucide User 실루엣을 회색 배경 위에 보여 "사진 미등록" 을 명확히 한다.
//   - 기존 화면들이 (vendor.name).slice(0,2) 같은 이니셜 fallback 을 쓰던 것을
//     본 컴포넌트로 통일해 모든 파트너 표시 면에서 일관된 모양을 갖는다.
import { User } from "lucide-react";
import { AuthImage } from "@/components/auth-image";

const BASE = (import.meta.env.BASE_URL ?? "/") as string;
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

export type VendorAvatarSize = "sm" | "md" | "lg" | "xl";

interface VendorAvatarProps {
  /** vendors.profileImageUrl 에 저장된 storage objectPath. null/empty 면 silhouette. */
  profileImageUrl?: string | null;
  /** 접근성 alt. 보통 업체명. */
  alt?: string;
  size?: VendorAvatarSize;
  className?: string;
  testId?: string;
}

const SIZE_CLASS: Record<VendorAvatarSize, string> = {
  sm: "w-8 h-8",
  md: "w-12 h-12",
  lg: "w-16 h-16",
  xl: "w-20 h-20",
};

const ICON_CLASS: Record<VendorAvatarSize, string> = {
  sm: "w-4 h-4",
  md: "w-6 h-6",
  lg: "w-8 h-8",
  xl: "w-10 h-10",
};

function toAuthSrc(objectPath: string): string {
  // 저장값이 "/objects/..." 또는 "uploads/..." 형태 모두 가능. 정규화.
  return `${API_BASE}/storage/objects/${objectPath.replace(/^\/objects\//, "").replace(/^\//, "")}`;
}

export function VendorAvatar({
  profileImageUrl,
  alt,
  size = "md",
  className = "",
  testId,
}: VendorAvatarProps) {
  const sizeClass = SIZE_CLASS[size];
  const iconClass = ICON_CLASS[size];
  const trimmed = profileImageUrl?.trim();
  return (
    <div
      className={`${sizeClass} rounded-full overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 ${className}`}
      data-testid={testId}
      aria-label={alt}
    >
      {trimmed ? (
        <AuthImage
          src={toAuthSrc(trimmed)}
          alt={alt ?? "프로필 사진"}
          className="w-full h-full object-cover"
        />
      ) : (
        <User className={iconClass} aria-hidden />
      )}
    </div>
  );
}
