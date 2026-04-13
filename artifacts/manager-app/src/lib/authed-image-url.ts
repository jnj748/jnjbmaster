export function authedImageUrl(url: string | null | undefined, token: string | null): string {
  if (!url || !token) return url || "";
  if (!url.includes("/storage/objects/")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}
