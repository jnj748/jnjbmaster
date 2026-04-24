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

/**
 * 주어진 엘리먼트를 편집 가능한 Word(.docx) Blob 으로 변환한다.
 * 사진은 data: URL 로 인라인되어 다른 기기에서도 깨지지 않는다.
 */
export async function elementToDocxBlob(element: HTMLElement, title: string): Promise<Blob> {
  const inner = await inlineImagesAsDataUrls(element);
  const html =
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>` +
    `<style>` +
    `body{font-family:'Noto Sans KR','Malgun Gothic',sans-serif;color:#111827;font-size:11pt;}` +
    `table{border-collapse:collapse;width:100%;}td,th{padding:6px 8px;border:1px solid #888;}` +
    `img{max-width:100%;}` +
    `h1,h2,h3{margin:8px 0;}` +
    `</style></head><body>${inner}</body></html>`;
  const mod = await import("html-docx-js-typescript");
  const out = await mod.asBlob(html);
  if (out instanceof Blob) return out;
  return new Blob([out as unknown as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

/**
 * 주어진 엘리먼트를 PDF Blob 으로 만들어 반환한다.
 * A4 세로 기준으로 너비를 맞추고, 길이가 길면 페이지를 자동으로 분할한다.
 *
 * [용량 최적화]
 *   - PNG 대신 JPEG(품질 0.82) 로 캡처 → 동일 해상도 대비 5~10배 압축.
 *   - pixelRatio 기본 1.5 (이전 2). 외부 공유 PDF 는 인쇄가 아닌 화면 열람 위주이므로
 *     1.5 배율로도 텍스트 가독성에 충분하면서 픽셀 수가 약 56% 로 감소.
 *   - jsPDF compress 옵션으로 객체 스트림을 zlib 압축.
 *   - 기기 DPR 이 매우 높은 모바일에서는 캡처가 과도해질 수 있어 cap 을 둔다.
 *   필요시 호출자에서 quality / pixelRatio 를 조정할 수 있다.
 */
export interface PdfBlobOptions {
  /** JPEG 품질 0~1. 기본 0.82 (가독성/용량 균형). */
  quality?: number;
  /** 캡처 배율. 기본 1.5. 모바일 DPR 영향 받지 않도록 명시 지정 권장. */
  pixelRatio?: number;
}
export async function elementToPdfBlob(
  element: HTMLElement,
  options: PdfBlobOptions = {},
): Promise<Blob> {
  const { toJpeg } = await import("html-to-image");
  const { jsPDF } = await import("jspdf");
  const quality = options.quality ?? 0.82;
  const pixelRatio = options.pixelRatio ?? 1.5;
  const dataUrl = await toJpeg(element, {
    cacheBust: false,
    backgroundColor: "#ffffff",
    pixelRatio,
    quality,
  });
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("이미지 로드 실패"));
    img.src = dataUrl;
  });
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "p", compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW;
  const imgH = (img.height * imgW) / img.width;
  let heightLeft = imgH;
  let position = 0;
  // FAST 압축 모드: 이미 JPEG 로 손실 압축된 데이터이므로 jsPDF 의 추가 deflate 는 의미가 적고
  // FAST 옵션이 처리 속도를 크게 단축한다.
  pdf.addImage(dataUrl, "JPEG", 0, position, imgW, imgH, undefined, "FAST");
  heightLeft -= pageH;
  while (heightLeft > 0) {
    position = heightLeft - imgH;
    pdf.addPage();
    pdf.addImage(dataUrl, "JPEG", 0, position, imgW, imgH, undefined, "FAST");
    heightLeft -= pageH;
  }
  return pdf.output("blob");
}

/**
 * 엘리먼트를 PDF 로 변환하여 Web Share API 로 공유한다.
 * 파일 공유 미지원 환경에서는 다운로드로 폴백한다.
 */
export async function sharePdfFromElement(
  element: HTMLElement,
  filename: string,
  shareTitle: string,
): Promise<"shared" | "downloaded" | "failed"> {
  try {
    const blob = await elementToPdfBlob(element);
    const safe = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
    const file = new File([blob], safe, { type: "application/pdf" });
    const nav = typeof navigator !== "undefined" ? navigator : null;
    const navWithShare = nav as unknown as {
      canShare?: (data: { files?: File[] }) => boolean;
      share?: (data: { files?: File[]; title?: string }) => Promise<void>;
    } | null;
    if (
      navWithShare?.canShare &&
      navWithShare.canShare({ files: [file] }) &&
      typeof navWithShare.share === "function"
    ) {
      try {
        await navWithShare.share({ files: [file], title: shareTitle });
        return "shared";
      } catch {
        // 사용자 취소 또는 실패 → 다운로드 폴백
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = safe;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return "downloaded";
  } catch {
    return "failed";
  }
}

export function safeFilename(s: string): string {
  return s
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}
