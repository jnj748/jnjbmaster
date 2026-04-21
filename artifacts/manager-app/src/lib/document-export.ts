export async function downloadElementAsPng(
  element: HTMLElement,
  filename: string,
): Promise<void> {
  const { toPng } = await import("html-to-image");
  // cacheBust=true 는 blob: URL 에 ?cacheBust=... 쿼리를 붙여 깨뜨리므로 사용하지 않는다.
  const dataUrl = await toPng(element, {
    cacheBust: false,
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

/**
 * 문서 내 모든 <img> 의 src 를 data: URL 로 인라인 변환한 outerHTML 을 반환한다.
 * blob:/외부 인증 URL 은 다른 문서(워드/뷰어)에서 접근 불가능하므로
 * 저장 파일이 손상되어 보이는 문제를 방지한다.
 */
export async function inlineImagesAsDataUrls(element: HTMLElement): Promise<string> {
  const clone = element.cloneNode(true) as HTMLElement;
  const imgs = Array.from(clone.querySelectorAll("img"));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute("src");
      if (!src) return;
      if (src.startsWith("data:")) return;
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const dataUrl: string = await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result));
          fr.onerror = () => reject(fr.error);
          fr.readAsDataURL(blob);
        });
        img.setAttribute("src", dataUrl);
      } catch {
        // 변환 실패 시 src 를 비워 깨진 링크가 문서에 남지 않게 한다.
        img.removeAttribute("src");
      }
    }),
  );
  return clone.outerHTML;
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
