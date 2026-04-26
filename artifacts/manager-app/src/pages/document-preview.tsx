import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Share2, Download, Printer } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import {
  A4DocumentFrame,
  type A4DocumentFrameHandle,
} from "@/components/a4-document-frame";
import {
  downloadElementAsPng,
  safeFilename,
} from "@/lib/document-export";
import {
  type OfficialDocumentInput,
  type OfficialDocumentKind,
  OFFICIAL_DOC_KIND_LABELS,
  formatKoreanDate,
  readOfficialDocumentInput,
  shareDocument,
} from "@/lib/official-document";

const STATUS_BADGE: Record<string, string> = {
  good: "○ 양호",
  caution: "△ 주의",
  bad: "× 불량",
  info: "·",
};

function isKind(v: string | null): v is OfficialDocumentKind {
  return v === "draft" || v === "notice" || v === "report";
}

function buildPlainBody(input: OfficialDocumentInput, kind: OfficialDocumentKind): string {
  const lines: string[] = [];
  lines.push(`[${OFFICIAL_DOC_KIND_LABELS[kind]}] ${input.title}`);
  lines.push(`일자: ${formatKoreanDate(input.date)}`);
  if (input.buildingName) lines.push(`대상: ${input.buildingName}`);
  if (input.authorName) lines.push(`작성자: ${input.authorName}`);
  if (input.summary?.length) {
    lines.push("");
    lines.push("[요약]");
    for (const s of input.summary) lines.push(`- ${s.label}: ${s.value}`);
  }
  if (input.items?.length) {
    lines.push("");
    lines.push("[세부 항목]");
    for (const it of input.items) {
      const status = it.status ? `[${STATUS_BADGE[it.status]}] ` : "";
      const value = it.value ? ` - ${it.value}` : "";
      const meta = it.meta ? ` (${it.meta})` : "";
      lines.push(`- ${status}${it.label}${value}${meta}`);
    }
  }
  if (input.notes) {
    lines.push("");
    lines.push("[특이사항]");
    lines.push(input.notes);
  }
  return lines.join("\n");
}

export default function DocumentPreviewPage() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const documentRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<A4DocumentFrameHandle>(null);
  const [exporting, setExporting] = useState(false);
  const [input, setInput] = useState<OfficialDocumentInput | null>(null);

  const search = typeof window !== "undefined" ? window.location.search : "";
  const kindParam = useMemo(() => {
    const p = new URLSearchParams(search).get("kind");
    return isKind(p) ? p : "report";
  }, [search]);

  useEffect(() => {
    const stored = readOfficialDocumentInput();
    setInput(stored);
  }, [location]);

  if (!input) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <p className="text-muted-foreground">
              표시할 공문 데이터가 없습니다. 업무 완료 화면에서 다시 시도해주세요.
            </p>
            <Button variant="outline" onClick={() => setLocation("/")}>
              <ArrowLeft className="w-4 h-4 mr-2" />홈으로
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const kindLabel = OFFICIAL_DOC_KIND_LABELS[kindParam];
  const todayLabel = formatKoreanDate(new Date());
  const filename = safeFilename(`${input.buildingName ?? "공문"}_${kindLabel}_${input.title}_${todayLabel}`);

  async function withReady<T>(fn: () => Promise<T> | T): Promise<T> {
    if (frameRef.current) {
      return await frameRef.current.withFullScale(fn);
    }
    return await fn();
  }

  async function handleShare() {
    if (!input) return;
    const result = await shareDocument({
      title: `${kindLabel} - ${input.title}`,
      text: buildPlainBody(input, kindParam),
    });
    if (result === "shared") {
      toast({ title: "공유가 시작되었습니다" });
    } else if (result === "copied") {
      toast({ title: "내용이 클립보드에 복사되었습니다" });
    } else {
      toast({ title: "공유에 실패했습니다", variant: "destructive" });
    }
  }

  async function handleDownload() {
    if (!documentRef.current) return;
    setExporting(true);
    try {
      await withReady(async () => {
        if (documentRef.current) {
          await downloadElementAsPng(documentRef.current, filename);
          toast({ title: "이미지 저장 완료" });
        }
      });
    } catch (e) {
      toast({ title: "이미지 저장 실패", description: String(e), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  function handlePrint() {
    void withReady(() => {
      window.print();
    });
  }

  function changeKind(k: OfficialDocumentKind) {
    setLocation(`/documents/preview?kind=${k}`);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-10">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
            <ArrowLeft className="w-4 h-4 mr-1" />뒤로
          </Button>
          <div>
            <h1 className="text-xl font-bold">{kindLabel} 미리보기</h1>
            <p className="text-xs text-muted-foreground">{input.sourceLabel}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleShare}>
            <Share2 className="w-4 h-4 mr-1" />공유
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload} disabled={exporting}>
            <Download className="w-4 h-4 mr-1" />
            {exporting ? "저장 중..." : "이미지 저장"}
          </Button>
          <Button size="sm" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-1" />인쇄
          </Button>
        </div>
      </div>

      <div className="flex gap-2 print:hidden">
        {(["draft", "notice", "report"] as OfficialDocumentKind[]).map((k) => (
          <Button
            key={k}
            size="sm"
            variant={kindParam === k ? "default" : "outline"}
            onClick={() => changeKind(k)}
          >
            {OFFICIAL_DOC_KIND_LABELS[k]}
          </Button>
        ))}
      </div>

      <A4DocumentFrame ref={frameRef}>
        <div
          ref={documentRef}
          className="a4-document"
          style={{
            fontFamily: "'Noto Sans KR', 'Malgun Gothic', sans-serif",
            padding: "48px 56px",
            background: "#ffffff",
            minHeight: 1123,
            color: "#111827",
          }}
        >
          {kindParam === "draft" && (
            <DraftDocument input={input} authorFallback={user?.name} />
          )}
          {kindParam === "notice" && <NoticeDocument input={input} />}
          {kindParam === "report" && (
            <ReportDocument input={input} authorFallback={user?.name} />
          )}
        </div>
      </A4DocumentFrame>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">
      {children}
    </p>
  );
}

function SummaryGrid({ items }: { items?: { label: string; value: string }[] }) {
  if (!items?.length) return null;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm border border-gray-300 rounded p-3 bg-gray-50">
      {items.map((s, i) => (
        <div key={i} className="flex">
          <span className="font-semibold w-24 shrink-0">{s.label}</span>
          <span className="flex-1">{s.value}</span>
        </div>
      ))}
    </div>
  );
}

function ItemsList({ items }: { items?: { label: string; value?: string; meta?: string; status?: string }[] }) {
  if (!items?.length) return null;
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="bg-gray-100 border-y border-gray-400">
          <th className="text-left p-2 w-12">번호</th>
          <th className="text-left p-2">항목</th>
          <th className="text-left p-2 w-24">결과</th>
          <th className="text-left p-2">비고</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it, i) => (
          <tr key={i} className="border-b border-gray-300">
            <td className="p-2 align-top">{i + 1}</td>
            <td className="p-2 align-top">{it.label}</td>
            <td className="p-2 align-top">
              {it.status ? STATUS_BADGE[it.status] ?? it.value ?? "" : it.value ?? ""}
            </td>
            <td className="p-2 align-top text-gray-600">{it.meta ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PhotoGrid({ photos }: { photos?: string[] }) {
  if (!photos?.length) return null;
  return (
    <div className="grid grid-cols-3 gap-2 mt-3">
      {photos.slice(0, 6).map((url, i) => (
        <img
          key={i}
          src={url}
          alt={`첨부 ${i + 1}`}
          className="w-full h-28 object-cover border border-gray-300 rounded"
          crossOrigin="anonymous"
        />
      ))}
    </div>
  );
}

function NotesBlock({ notes }: { notes?: string }) {
  if (!notes) return null;
  return (
    <div className="text-sm border border-gray-300 rounded p-3 whitespace-pre-line leading-6">
      {notes}
    </div>
  );
}

function DraftDocument({ input, authorFallback }: { input: OfficialDocumentInput; authorFallback?: string | null }) {
  const author = input.authorName || authorFallback || "";
  return (
    <div className="space-y-3">
      <div className="flex items-stretch gap-4 border-b-2 border-black pb-3">
        <h2 className="flex-1 self-center text-2xl font-bold tracking-wide">
          기 안 서
        </h2>
        <table className="border border-gray-500 text-center text-xs table-fixed w-64 shrink-0">
          <thead>
            <tr>
              <th className="border border-gray-500 bg-gray-100 py-1 w-1/4">결재</th>
              <th className="border border-gray-500 py-1 w-1/4">담당</th>
              <th className="border border-gray-500 py-1 w-1/4">검토</th>
              <th className="border border-gray-500 py-1 w-1/4">승인</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-500 py-6 bg-gray-50">서명</td>
              <td className="border border-gray-500 py-6"></td>
              <td className="border border-gray-500 py-6"></td>
              <td className="border border-gray-500 py-6"></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm pt-2">
        <div className="flex"><span className="font-semibold w-20">기안일</span><span>{formatKoreanDate(input.date)}</span></div>
        <div className="flex"><span className="font-semibold w-20">기안자</span><span>{author}</span></div>
        {input.buildingName && (
          <div className="flex col-span-2"><span className="font-semibold w-20">대상</span><span>{input.buildingName}</span></div>
        )}
        <div className="flex col-span-2"><span className="font-semibold w-20">제목</span><span className="font-semibold">{input.title}</span></div>
      </div>

      <SectionTitle>1. 기안 사유</SectionTitle>
      <p className="text-sm leading-7">
        아래와 같이 {input.sourceLabel}을(를) 시행하고자 하오니, 검토 후 결재하여 주시기 바랍니다.
      </p>

      <SectionTitle>2. 추진(예정) 내용</SectionTitle>
      <SummaryGrid items={input.summary} />

      {input.items?.length ? (
        <>
          <SectionTitle>3. 세부 추진 항목</SectionTitle>
          <ItemsList items={input.items} />
        </>
      ) : null}

      {input.notes ? (
        <>
          <SectionTitle>4. 특이·협조 사항</SectionTitle>
          <NotesBlock notes={input.notes} />
        </>
      ) : null}

      {input.photos?.length ? (
        <>
          <SectionTitle>첨부 사진</SectionTitle>
          <PhotoGrid photos={input.photos} />
        </>
      ) : null}

      <div className="text-center pt-8 space-y-1 text-sm">
        <p>{formatKoreanDate(new Date())}</p>
        <p className="font-semibold">기안자: {author}</p>
      </div>
    </div>
  );
}

function NoticeDocument({ input }: { input: OfficialDocumentInput }) {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold tracking-[0.4em] text-center border-b-2 border-black pb-3">
        공 고 문
      </h2>
      <p className="text-right text-sm">공고일자: {formatKoreanDate(input.date)}</p>
      <h3 className="text-xl font-bold text-center pt-2">{input.title}</h3>

      <p className="text-[15px] leading-8 pt-2">
        입주민 여러분께 알려드립니다.
        <br />
        {input.buildingName ? `${input.buildingName} ` : ""}관리사무소에서는 아래와 같이 {input.sourceLabel}을(를) 시행하였기에 그 결과를 안내드립니다.
        쾌적한 주거 환경 유지를 위해 입주민 여러분의 많은 협조 부탁드립니다.
      </p>

      <SectionTitle>○ 안내 사항</SectionTitle>
      <SummaryGrid items={input.summary} />

      {input.items?.length ? (
        <>
          <SectionTitle>○ 세부 내역</SectionTitle>
          <ItemsList items={input.items} />
        </>
      ) : null}

      {input.notes ? (
        <>
          <SectionTitle>○ 참고 및 협조 사항</SectionTitle>
          <NotesBlock notes={input.notes} />
        </>
      ) : null}

      {input.photos?.length ? (
        <>
          <SectionTitle>○ 현장 사진</SectionTitle>
          <PhotoGrid photos={input.photos} />
        </>
      ) : null}

      <div className="text-center pt-10 space-y-1">
        <p className="text-sm">{formatKoreanDate(new Date())}</p>
        <p className="text-lg font-bold tracking-wide">
          {input.buildingName ? `${input.buildingName} ` : ""}관리사무소장
        </p>
        <p className="text-xs text-gray-600">(직인생략)</p>
      </div>
    </div>
  );
}

function ReportDocument({ input, authorFallback }: { input: OfficialDocumentInput; authorFallback?: string | null }) {
  const author = input.authorName || authorFallback || "";
  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-bold text-center border-b-2 border-black pb-3">
        업 무 보 고 서
      </h2>
      <table className="w-full text-sm border-collapse mt-2">
        <tbody>
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold w-24 p-2">제목</td>
            <td className="border border-gray-400 p-2" colSpan={3}>{input.title}</td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold p-2">보고일</td>
            <td className="border border-gray-400 p-2">{formatKoreanDate(input.date)}</td>
            <td className="border border-gray-400 bg-gray-100 font-semibold w-24 p-2">보고자</td>
            <td className="border border-gray-400 p-2">{author}</td>
          </tr>
          {input.buildingName && (
            <tr>
              <td className="border border-gray-400 bg-gray-100 font-semibold p-2">대상</td>
              <td className="border border-gray-400 p-2" colSpan={3}>{input.buildingName}</td>
            </tr>
          )}
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold p-2">구분</td>
            <td className="border border-gray-400 p-2" colSpan={3}>{input.sourceLabel}</td>
          </tr>
        </tbody>
      </table>

      <p className="text-sm leading-7 pt-2">
        아래와 같이 {input.sourceLabel} 결과를 보고드립니다.
      </p>

      <SectionTitle>1. 업무 개요</SectionTitle>
      <SummaryGrid items={input.summary} />

      {input.items?.length ? (
        <>
          <SectionTitle>2. 수행(완료) 내역</SectionTitle>
          <ItemsList items={input.items} />
        </>
      ) : null}

      {input.notes ? (
        <>
          <SectionTitle>3. 조치 결과 및 의견</SectionTitle>
          <NotesBlock notes={input.notes} />
        </>
      ) : null}

      {input.photos?.length ? (
        <>
          <SectionTitle>첨부 사진</SectionTitle>
          <PhotoGrid photos={input.photos} />
        </>
      ) : null}

      <div className="text-right pt-8 text-sm space-y-1">
        <p>{formatKoreanDate(new Date())}</p>
        <p>보고자: {author} (서명)</p>
      </div>
    </div>
  );
}
