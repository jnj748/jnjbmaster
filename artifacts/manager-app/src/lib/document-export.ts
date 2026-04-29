import {
  collectBreakCandidatesCssPx,
  computePageBreakCuts,
} from "./pdf-page-break";

export interface DownloadElementAsPngOptions {
  /**
   * [Task #474] PNG 캡처 시점에만 `export-compact` 클래스를 추가하여
   * 본문 폰트를 한 단계 줄이고 짧은 라벨 셀의 줄바꿈을 막는다.
   * 캡처 종료(성공/실패 무관) 후 반드시 원복된다.
   * 화면 미리보기·인쇄·공유(PDF/텍스트) 경로에는 영향이 없다.
   */
  compact?: boolean;
}

/**
 * [Task #589] 브라우저 캔버스 한쪽 변 한계의 보수적 추정값(px).
 *   Chrome/Firefox 데스크톱: 16384 / 32767, iOS Safari: 4096~5MP 까지로 알려져
 *   있다. PNG 캡처가 이 한계를 넘으면 결과물이 비거나 자를 수 있어, 그
 *   이상 길이일 때는 페이지 단위 PNG 묶음으로 폴백한다.
 */
const PNG_MAX_HEIGHT_PX = 14000;
/** A4 한 장 높이 / 너비 비율. 폴백 페이지 분할 시 사용. */
const A4_ASPECT_HEIGHT_OVER_WIDTH = 297 / 210;

export async function downloadElementAsPng(
  element: HTMLElement,
  filename: string,
  options: DownloadElementAsPngOptions = {},
): Promise<void> {
  const { toPng } = await import("html-to-image");
  const compact = options.compact === true;
  const hadCompact = compact && element.classList.contains("export-compact");
  if (compact && !hadCompact) {
    element.classList.add("export-compact");
  }
  try {
    const baseName = filename.endsWith(".png")
      ? filename.slice(0, -4)
      : filename;

    // [Task #589] 매우 긴 본문은 단일 PNG 한 장이 캔버스 한계를 넘어 비거나
    //   잘릴 수 있다. 캡처 전 예상 픽셀 높이를 보고 한계를 넘으면 페이지
    //   단위로 분할된 여러 PNG 로 저장한다(파일명에 _p1, _p2 ... 접미사).
    const pixelRatio = 2;
    const elementWidthPx = element.getBoundingClientRect().width;
    const elementHeightPx = Math.max(element.scrollHeight, element.clientHeight);
    const expectedImgHeight = elementHeightPx * pixelRatio;

    if (expectedImgHeight > PNG_MAX_HEIGHT_PX && elementWidthPx > 0) {
      // 페이지 단위 분할 PNG. 행/문단 경계로 스냅한 컷을 사용한다.
      const breakCandidatesCss = collectBreakCandidatesCssPx(element);
      const breakCandidatesImg = breakCandidatesCss.map(
        (y) => Math.round(y * pixelRatio),
      );
      const pageHeightImgPx = Math.round(
        elementWidthPx * A4_ASPECT_HEIGHT_OVER_WIDTH * pixelRatio,
      );
      const cuts = computePageBreakCuts(
        Math.round(expectedImgHeight),
        pageHeightImgPx,
        breakCandidatesImg,
      );

      // 큰 단일 캡처 1번 → 페이지별로 잘라 저장. (toPng 가 성공한다는 가정)
      const fullDataUrl = await toPng(element, {
        cacheBust: false,
        backgroundColor: "#ffffff",
        pixelRatio,
      });
      const img = await loadImage(fullDataUrl);
      // 실제 이미지 높이 기반으로 컷을 다시 정규화 (예상치와 미세 차이 보정)
      const scale = img.height / expectedImgHeight;
      const totalPages = cuts.length - 1;
      for (let i = 0; i < totalPages; i++) {
        const startPx = Math.round(cuts[i] * scale);
        const endPx = Math.round(cuts[i + 1] * scale);
        const sliceHeight = Math.max(1, endPx - startPx);
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = sliceHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas context 생성 실패");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(
          img,
          0,
          startPx,
          img.width,
          sliceHeight,
          0,
          0,
          img.width,
          sliceHeight,
        );
        const pageDataUrl = canvas.toDataURL("image/png");
        triggerDownload(
          pageDataUrl,
          `${baseName}_p${String(i + 1).padStart(2, "0")}.png`,
        );
      }
      return;
    }

    // 기본 경로: 단일 PNG.
    // cacheBust=true 는 blob: URL 에 ?cacheBust=... 쿼리를 붙여 깨뜨리므로 사용하지 않는다.
    const dataUrl = await toPng(element, {
      cacheBust: false,
      backgroundColor: "#ffffff",
      pixelRatio,
    });
    triggerDownload(dataUrl, `${baseName}.png`);
  } finally {
    if (compact && !hadCompact) {
      element.classList.remove("export-compact");
    }
  }
}

function triggerDownload(href: string, filename: string): void {
  const link = document.createElement("a");
  link.download = filename;
  link.href = href;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지 로드 실패"));
    img.src = src;
  });
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

  // [Task #589] 캡처 직전 행/문단 bottom 좌표(=끊어도 되는 위치) 를 모아둔다.
  //   캡처 후엔 DOM 이 변하지 않더라도 측정은 캡처 시점과 동일한 상태에서
  //   해야 안전하다.
  const elementWidthCssPx = element.getBoundingClientRect().width;
  const breakCandidatesCss = collectBreakCandidatesCssPx(element);

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

  // 단일 페이지 (A4 한 장 안에 들어가는 경우) — 그대로 한 장 추가하고 종료.
  if (imgH <= pageH + 0.5) {
    pdf.addImage(dataUrl, "JPEG", 0, 0, imgW, imgH, undefined, "FAST");
    return pdf.output("blob");
  }

  // [Task #589] 다중 페이지 — 페이지 컷을 행/문단 bottom 으로 스냅한다.
  //   이전 구현은 페이지마다 정확히 pageH 만큼 잘라 본문 행이 페이지
  //   경계에서 절반만 인쇄되는 문제가 있었다. 아래 분기는 캡처 결과의
  //   실제 픽셀 좌표 공간(0..img.height)에서 행 bottom 후보를 사용해 가장
  //   가까운 끊을 수 있는 위치로 스냅한다.
  const cssToImgScale = elementWidthCssPx > 0 ? img.width / elementWidthCssPx : pixelRatio;
  const breakCandidatesImgPx = breakCandidatesCss.map((y) => Math.round(y * cssToImgScale));
  // 한 PDF 페이지에 담을 수 있는 이미지 픽셀 수 (mm → px 환산).
  const imgPxPerMm = img.height / imgH; // == img.width / pageW
  const pageHeightImgPx = pageH * imgPxPerMm;
  const cuts = computePageBreakCuts(img.height, pageHeightImgPx, breakCandidatesImgPx);

  // 각 페이지: addImage 의 y 좌표를 음수로 밀어 해당 페이지 슬라이스가 페이지
  //   상단에 정렬되게 한다. PDF 뷰어는 페이지 mediabox 밖의 픽셀을 표시하지
  //   않으므로 다음 페이지로 새는 일은 없다.
  for (let i = 0; i < cuts.length - 1; i++) {
    const startPx = cuts[i];
    const startMm = startPx / imgPxPerMm;
    if (i > 0) pdf.addPage();
    // FAST 압축 모드: 이미 JPEG 로 손실 압축된 데이터이므로 jsPDF 의 추가 deflate 는
    // 의미가 적고 FAST 옵션이 처리 속도를 크게 단축한다.
    pdf.addImage(dataUrl, "JPEG", 0, -startMm, imgW, imgH, undefined, "FAST");
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
