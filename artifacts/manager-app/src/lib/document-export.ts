import { toPng } from "html-to-image";

export async function downloadElementAsPng(
  element: HTMLElement,
  filename: string,
): Promise<void> {
  const dataUrl = await toPng(element, {
    cacheBust: true,
    backgroundColor: "#ffffff",
    pixelRatio: 2,
  });
  const link = document.createElement("a");
  link.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function openMailtoWithDocument(opts: {
  to?: string;
  subject: string;
  body: string;
}): void {
  const params = new URLSearchParams();
  params.set("subject", opts.subject);
  params.set("body", opts.body);
  const to = opts.to ?? "";
  const url = `mailto:${encodeURIComponent(to)}?${params
    .toString()
    .replace(/\+/g, "%20")}`;
  window.location.href = url;
}

export function safeFilename(s: string): string {
  return s
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}
