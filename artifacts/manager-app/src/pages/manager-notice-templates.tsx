import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useLocation } from "wouter";
import { format, parse, isValid } from "date-fns";
import { buildApprovalPrefillSearch } from "@/lib/approval-prefill";
import { ko } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  useListBuildingNoticeTemplates,
  useRegisterNoticeOutput,
} from "@workspace/api-client-react";
import type {
  BuildingNoticeTemplate,
  RegisterNoticeOutputBody,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { useBuilding } from "@/contexts/building-context";
import {
  downloadElementAsPng,
  elementToDocxBlob,
  sharePdfFromElement,
  safeFilename,
} from "@/lib/document-export";
import { useToast } from "@/hooks/use-toast";
import {
  Download,
  FileText,
  Printer,
  RotateCcw,
  Share2,
  Upload,
  X as XIcon,
} from "lucide-react";
import { A4DocumentFrame, type A4DocumentFrameHandle } from "@/components/a4-document-frame";
import { NoticeLayoutFrame } from "@/components/notice-layout-frame";
import {
  NoticeBodyEditor,
  type NoticeBodyEditorHandle,
} from "@/components/notice-body-editor";
import { useNoticeLayout } from "@/hooks/use-notice-layout";
import { renderNoticeBodyHtml } from "@/lib/notice-layout";
import { printIsolatedNode } from "@/lib/print-isolate";

// [Task #323] 관리소장 공지문 템플릿
//   - 플랫폼이 만든 템플릿 목록을 카드로 표시.
//   - 카드 선택 → 문서생성 모달(편집/미리보기 토글 + A4 인쇄 레이아웃) 으로
//     건물정보+사용자 입력값을 채운 본문을 보여주고
//     이미지 저장 / 공유(PDF) / 문서로 저장(.docx) / 인쇄 4가지 액션을 제공.
//   - 본문 HTML 의 placeholder({{...}})는 클라이언트에서 치환한다.
// [Task #583] PreviewDialog 를 알림 처리 후 뜨는 CompletionNotice 와 동일한
//   문서생성 모달 패턴(편집/미리보기 토글 + A4DocumentFrame + printIsolatedNode)
//   으로 재구성해 한 가지 문서 UX 로 통일했다.

function todayKR(): string {
  const d = new Date();
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function parseLabels(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

export default function ManagerNoticeTemplatesPage() {
  // [Task #608] HQ 관리자가 본사 화면에서 템플릿을 수정·저장하면, 매니저가
  //   다음에 이 화면에 들어왔을 때 즉시 반영되도록 stale 처리를 하지 않고
  //   매번 마운트 시 재요청한다.
  const { data, isLoading } = useListBuildingNoticeTemplates({
    query: { staleTime: 0, refetchOnMount: "always" },
  });
  const templates: BuildingNoticeTemplate[] = data?.templates ?? [];

  // [공지 양식 개편] 고정 카테고리 탭 (전체 + 6개 도메인).
  //   code → 표시 라벨. 템플릿의 category 필드가 code 와 일치할 때 해당 탭에 들어간다.
  //   기존 자유서식 카테고리("일반" 등) 는 6개 매핑에 없으므로 "전체" 탭에서만 보인다.
  const CATEGORY_TABS: Array<{ code: string; label: string }> = [
    { code: "전체", label: "전체" },
    { code: "fire_safety", label: "소방·안전" },
    { code: "lifestyle", label: "생활질서" },
    { code: "environment", label: "환경·미화" },
    { code: "facility", label: "시설·설비" },
    { code: "management_fee", label: "관리비" },
    { code: "meeting", label: "회의·공고" },
  ];
  const CATEGORY_LABEL_BY_CODE = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of CATEGORY_TABS) m.set(t.code, t.label);
    return m;
  }, []);

  const [activeCategory, setActiveCategory] = useState<string>("전체");
  const filtered = templates.filter(
    (t) => activeCategory === "전체" || t.category === activeCategory,
  );
  const [selected, setSelected] = useState<BuildingNoticeTemplate | null>(null);

  // [공지 양식 개편] 이달의 추천 양식 — 현재 월(1-12) 이 recommendedMonths 에
  //   포함된 템플릿을 최대 4개까지 상단 추천 섹션에 노출. 0개면 섹션 자체를 숨김.
  const currentMonth = new Date().getMonth() + 1;
  const recommended = useMemo(() => {
    const list = templates.filter((t) => {
      const months = (t as unknown as { recommendedMonths?: number[] | null })
        .recommendedMonths;
      return Array.isArray(months) && months.includes(currentMonth);
    });
    return list.slice(0, 4);
  }, [templates, currentMonth]);

  // [Task #393] 매니저 대시보드 알림 처리 다이얼로그의 "공고문 작성" CTA 에서
  //   /notices/templates?templateId=N 으로 진입한 경우, 목록 로드 후 일치하는 템플릿을
  //   자동 선택해 미리보기 다이얼로그를 띄운다. 일치 항목이 없으면 그냥 목록만 표시.
  //   한 번만 자동 진입하도록 가드 ref 사용.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (typeof window === "undefined") return;
    if (templates.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("templateId");
    if (!raw) {
      autoOpenedRef.current = true;
      return;
    }
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) {
      autoOpenedRef.current = true;
      return;
    }
    const match = templates.find((t) => t.id === id);
    if (match) {
      setSelected(match);
    }
    autoOpenedRef.current = true;
  }, [templates]);

  return (
    <div className="container mx-auto px-4 py-6 space-y-4 max-w-5xl">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">공지문 템플릿</h1>
          <p className="text-sm text-slate-500 mt-1">
            템플릿을 선택하면 우리 건물 정보가 자동으로 채워집니다. 이미지 저장·공유·문서 저장·인쇄가 가능합니다.
          </p>
        </div>
      </header>

      {/* [공지 양식 개편 A] 이달의 추천 양식 — recommendedMonths 가 현재 월을
            포함하는 템플릿이 한 건 이상일 때만 노출. 최대 4개 카드. */}
      {recommended.length > 0 && (
        <section
          className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3"
          data-testid="section-recommended-templates"
        >
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-bold text-amber-900">
              이달의 추천 양식
            </h2>
            <span className="text-xs text-amber-700">
              {currentMonth}월에 자주 쓰는 공고문
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {recommended.map((t) => {
              const catLabel = CATEGORY_LABEL_BY_CODE.get(t.category) ?? t.category;
              return (
                <div
                  key={`rec-${t.id}`}
                  className="rounded-lg border border-amber-200 bg-white p-3 flex flex-col gap-2"
                  data-testid={`card-recommended-${t.id}`}
                >
                  <div className="font-semibold text-sm line-clamp-2 min-h-[2.5rem]">
                    {t.title}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-[10px]">
                      {catLabel}
                    </Badge>
                    <TemplateTypeBadge type={(t as unknown as { type?: string }).type} />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="w-full mt-1"
                    onClick={() => setSelected(t)}
                    data-testid={`button-recommended-write-${t.id}`}
                  >
                    바로 작성
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* [공지 양식 개편 B] 고정 카테고리 탭 (전체 + 6개 도메인). */}
      <div className="flex flex-wrap gap-2" data-testid="filter-categories">
        {CATEGORY_TABS.map((c) => (
          <button
            key={c.code}
            type="button"
            onClick={() => setActiveCategory(c.code)}
            className={`px-3 py-1.5 rounded-full text-xs border ${
              activeCategory === c.code
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
            data-testid={`filter-category-${c.code}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">불러오는 중…</CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">사용할 수 있는 템플릿이 없습니다.</CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3" data-testid="grid-notice-templates">
          {filtered.map((t) => {
            const catLabel = CATEGORY_LABEL_BY_CODE.get(t.category) ?? t.category;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelected(t)}
                className="text-left rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400 hover:shadow-sm transition"
                data-testid={`card-template-${t.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className="text-3xl shrink-0" aria-hidden>
                    {t.icon ?? "📄"}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-1 mb-1">
                      <Badge variant="outline" className="text-[10px]">{catLabel}</Badge>
                      <TemplateTypeBadge type={(t as unknown as { type?: string }).type} />
                    </div>
                    <div className="font-semibold text-sm line-clamp-2">{t.title}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <PreviewDialog template={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

// [공지 양식 개편 C] 양식 유형 배지 — document=작성형(회색) / infographic=바로출력(녹색).
function TemplateTypeBadge({ type }: { type?: string | null }): ReactElement | null {
  if (type === "infographic") {
    return (
      <Badge
        className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
        data-testid="badge-template-type-infographic"
      >
        바로출력
      </Badge>
    );
  }
  // 기본값 = document (작성형). type 이 비어 있거나 알 수 없는 값이어도 작성형으로 표시.
  return (
    <Badge
      className="text-[10px] bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-100"
      data-testid="badge-template-type-document"
    >
      작성형
    </Badge>
  );
}

function generateNoticeNo(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const seq = String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0");
  return `${y}-${m}${d}-${seq}`;
}

function todayShort(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

function PreviewDialog({
  template,
  onClose,
}: {
  template: BuildingNoticeTemplate;
  onClose: () => void;
}) {
  const { building } = useBuilding();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  // [Task #504] 시스템 공고문 레이아웃 기본값을 받아 본문(템플릿 HTML)을 감싸 출력.
  const { layout: noticeLayout } = useNoticeLayout();
  const labels = useMemo(() => parseLabels(template.customFieldLabels), [template]);

  // 사용자 입력값 — 본문 토큰 치환에 사용.
  const [customA, setCustomA] = useState("");
  const [customB, setCustomB] = useState("");
  const [customC, setCustomC] = useState("");
  const [date, setDate] = useState(todayKR());

  // 문서 메타 — 편집 모드에서 수정 가능.
  const [title, setTitle] = useState(template.title);
  const [notesText, setNotesText] = useState("");
  const [postingPeriodOverride, setPostingPeriodOverride] = useState<string | null>(null);
  const [contactOverride, setContactOverride] = useState<string | null>(null);

  // 첨부 사진 — 다이얼로그 세션 동안만 메모리에 보관.
  const [photos, setPhotos] = useState<(string | null)[]>([null, null]);
  const photoInputRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  // 모달 상태.
  const [exporting, setExporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [exportingDoc, setExportingDoc] = useState(false);

  // [Task #610] 공고문 export 시 documents 레지스트리에 등록한다.
  const registerOutput = useRegisterNoticeOutput();
  function todayYmd(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  // 등록 결과를 기다려 실패 시 사용자에게 알린다. 산출물은 이미 만들어졌으므로
  // export UX 는 차단하지 않는다.
  async function recordOutput(format: RegisterNoticeOutputBody["format"]) {
    try {
      await registerOutput.mutateAsync({
        data: {
          templateId: template.id,
          title: title || template.title,
          format,
          outputDate: todayYmd(),
        },
      });
    } catch (err) {
      toast({
        title: "공고문 기록 실패",
        description:
          "공고문은 정상적으로 만들어졌지만 문서함에 기록되지 않았습니다. 잠시 후 다시 시도해 주세요.",
        variant: "destructive",
      });
      console.warn("registerNoticeOutput failed", err);
    }
  }
  // 공고NO 는 다이얼로그가 열릴 때 한 번 채번해 캡처/공유 동안 일정하게 유지.
  const [noticeNo] = useState(generateNoticeNo);

  const documentRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<A4DocumentFrameHandle>(null);
  const editorRef = useRef<NoticeBodyEditorHandle>(null);

  // [Task #591] body 상태는 raw 템플릿 HTML(`{{token}}` 칩 형식 그대로) 을 저장한다.
  //   - 편집기 안의 칩들은 NoticeChipResolverProvider 가 우리 건물 실제값으로
  //     자동 치환해 표시하므로, 별도의 renderNoticeBodyHtml 결과를 body 에 보관할
  //     필요가 없다.
  //   - 미리보기(A4) 영역에서는 body 를 renderNoticeBodyHtml 로 치환해 출력한다.
  //   - bodyDirty 는 사용자가 한 번이라도 본문 칩/문자를 직접 손봤다는 신호로
  //     남겨, 외부 reset 트리거가 없는 한 자동으로 덮어쓰지 않게 한다(잠금).
  const [body, setBody] = useState<string>(template.bodyHtml);
  const [bodyDirty, setBodyDirty] = useState(false);

  // [Task #591] 매니저 화면의 칩 치환에 사용할 토큰 값들.
  const tokenValues = useMemo<Record<string, string>>(
    () => ({
      buildingName: building?.name ?? "",
      addressFull: building?.addressFull ?? "",
      managementOfficePhone: building?.managementOfficePhone ?? "",
      // [Task #399] 신규 토큰 — 관리비 문의/시설 방재실 전화번호.
      feeInquiryPhone: building?.feeInquiryPhone ?? "",
      facilitySafetyPhone: building?.facilitySafetyPhone ?? "",
      date,
      customA,
      customB,
      customC,
    }),
    [building, date, customA, customB, customC],
  );

  // 미리보기에 사용할 최종 본문 HTML (chips → 실제값 치환).
  const renderedHtml = useMemo(
    () => renderNoticeBodyHtml(body, tokenValues),
    [body, tokenValues],
  );

  function handleResetBody() {
    // 편집기를 강제로 원본 템플릿 HTML 로 되돌리고 dirty 잠금 해제.
    editorRef.current?.setTemplateHtml(template.bodyHtml);
    setBody(template.bodyHtml);
    setBodyDirty(false);
  }

  function handleBodyChange(html: string) {
    setBody(html);
    if (!bodyDirty) setBodyDirty(true);
  }

  // 데이터 URL 은 메모리에 그대로 보관되므로 매우 큰 이미지가 들어오면
  // 다이얼로그 세션 내내 메모리 점유가 커진다. 10MB 를 상한선으로 둔다.
  const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

  function handlePhotoChange(idx: number, file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "이미지 파일만 첨부할 수 있습니다", variant: "destructive" });
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast({
        title: "사진이 너무 큽니다",
        description: "10MB 이하 이미지만 첨부할 수 있습니다.",
        variant: "destructive",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = String(e.target?.result || "");
      if (!dataUrl) return;
      setPhotos((prev) => {
        const next = [...prev];
        next[idx] = dataUrl;
        return next;
      });
    };
    reader.onerror = () => {
      toast({ title: "사진을 읽지 못했습니다", variant: "destructive" });
    };
    reader.readAsDataURL(file);
  }

  // "추가" / "교체" 클릭 시 input.value 를 먼저 비워야 동일 파일을 다시 선택해도
  // change 이벤트가 발생한다 (모든 브라우저 공통).
  function openPhotoPicker(idx: number) {
    const input = photoInputRefs[idx]?.current;
    if (!input) return;
    input.value = "";
    input.click();
  }

  function handlePhotoRemove(idx: number) {
    setPhotos((prev) => {
      const next = [...prev];
      next[idx] = null;
      return next;
    });
    const input = photoInputRefs[idx]?.current;
    if (input) input.value = "";
  }

  const filename = safeFilename(`${building?.name ?? "건물"}_${template.title}_${todayShort()}`);

  // [Task #583/#591] 캡처 직전 A4DocumentFrame 의 transform 을 풀어주는 헬퍼 —
  //   CompletionNotice 와 동일한 패턴. (#591 부터는 편집 패널이 항상 보이는
  //   2단 레이아웃이라 별도 편집 모드 토글이 없다.)
  async function withReadyDocument<T>(fn: () => Promise<T> | T): Promise<T> {
    await new Promise((r) => setTimeout(r, 80));
    if (frameRef.current) {
      return await frameRef.current.withFullScale(fn);
    }
    return await fn();
  }

  function handlePrint() {
    // [Task #583] withReadyDocument 가 편집 모드를 닫고 frame 의 transform 을
    //   풀어준 뒤, printIsolatedNode 가 .a4-document 노드를 `<body>` 직속
    //   격리 컨테이너로 deep-clone 해 인쇄한다. 모달의 positioning 영향을
    //   완전히 우회하므로 좌·우 정렬 + 다중 페이지 자연 흐름이 동시에 보장된다.
    void withReadyDocument(() => {
      printIsolatedNode(documentRef.current);
      recordOutput("pdf");
    });
  }

  async function handleDownloadImage() {
    if (!documentRef.current) return;
    setExporting(true);
    try {
      await withReadyDocument(async () => {
        if (!documentRef.current) return;
        await downloadElementAsPng(documentRef.current, filename);
        recordOutput("png");
        toast({ title: "이미지 저장 완료", description: "PNG 파일이 다운로드되었습니다." });
      });
    } catch (e) {
      toast({ title: "이미지 저장 실패", description: String(e), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  async function handleShare() {
    if (!documentRef.current) return;
    setSharing(true);
    try {
      await withReadyDocument(async () => {
        if (!documentRef.current) return;
        const result = await sharePdfFromElement(documentRef.current, filename, template.title);
        if (result === "shared") {
          recordOutput("share");
          toast({ title: "공유 시작", description: "원하는 앱으로 보내주세요." });
        } else if (result === "downloaded") {
          recordOutput("pdf");
          toast({ title: "PDF 저장됨", description: "기기에 저장된 PDF를 직접 첨부해 주세요." });
        } else {
          toast({ title: "공유 실패", variant: "destructive" });
        }
      });
    } finally {
      setSharing(false);
    }
  }

  async function handleDownloadDoc() {
    if (!documentRef.current) return;
    setExportingDoc(true);
    try {
      await withReadyDocument(async () => {
        if (!documentRef.current) return;
        const blob = await elementToDocxBlob(documentRef.current, template.title);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${filename}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        recordOutput("docx");
        toast({
          title: "문서 저장 완료",
          description: "Word(.docx) 파일로 저장되었습니다. 워드/한글/구글문서에서 열어 수정할 수 있습니다.",
        });
      });
    } catch (e) {
      toast({ title: "문서 저장 실패", description: String(e), variant: "destructive" });
    } finally {
      setExportingDoc(false);
    }
  }

  // [Task #624] 사용 모달에서 연락처 입력 칸이 제거되어 contactOverride 는
  //   항상 null 이다. 우측 미리보기는 contact prop 을 undefined 로 받아
  //   NoticeLayoutFrame 내부에서 시스템 contactTemplate 을 토큰 치환해 사용한다.
  const resolvedPostingPeriod = postingPeriodOverride ?? noticeLayout.defaultPostingPeriod;

  // [Task #608] 게시기간 종료일 캘린더 — 작성일(오늘) ~ 선택일 형식으로 자동 채움.
  //   - 기본은 시스템 설정(보통 "상시게재") 그대로 두고, 사용자가 종료일을 고르면
  //     "YYYY-MM-DD ~ YYYY-MM-DD" 형식으로 override 한다.
  //   - "상시게재로 되돌리기" 버튼을 눌러 override 를 해제하면 다시 시스템 기본값으로 돌아간다.
  const [postingPeriodOpen, setPostingPeriodOpen] = useState(false);
  const noticeStartDate = useMemo(() => new Date(), []);
  // override 가 "YYYY-MM-DD ~ YYYY-MM-DD" 형식이면 parsing 해서 캘린더 selected 표시.
  const parsedEndDate = useMemo<Date | undefined>(() => {
    if (!postingPeriodOverride) return undefined;
    const m = postingPeriodOverride.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
    if (!m) return undefined;
    const d = parse(m[2], "yyyy-MM-dd", new Date());
    return isValid(d) ? d : undefined;
  }, [postingPeriodOverride]);

  function handlePickPostingEnd(d: Date | undefined) {
    if (!d) return;
    const start = format(noticeStartDate, "yyyy-MM-dd");
    const end = format(d, "yyyy-MM-dd");
    setPostingPeriodOverride(`${start} ~ ${end}`);
    setPostingPeriodOpen(false);
  }
  function handleClearPostingPeriod() {
    setPostingPeriodOverride(null);
  }

  const nonNullPhotos = useMemo(() => photos.filter((p): p is string => !!p), [photos]);

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ResponsiveDialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto print:max-w-none print:shadow-none print:border-none">
        <ResponsiveDialogHeader className="print:hidden">
          <ResponsiveDialogTitle>
            <span className="mr-2">{template.icon ?? "📄"}</span>
            {template.title}
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        {/* [Task #591] 본사 관리자 모달과 동일한 좌(편집)+우(미리보기) 2단 레이아웃.
              좁은 화면에서는 자연스럽게 위/아래로 쌓인다. 미리보기는 인쇄/캡처
              헬퍼가 documentRef 노드를 deep-clone 해 격리된 컨테이너로 출력하므로
              modal 내부의 sticky 위치와 무관하게 항상 좌상단 기준으로 인쇄된다. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3 px-1 print:hidden">
            <div>
              <Label>제목</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                data-testid="input-title"
              />
            </div>

            {/* [Task #624] 게시기간을 제목 바로 아래 단독 행(폭 100%)으로 배치.
                  - 기본값은 "상시게재"(시스템 설정). 종료일 캘린더에서 날짜를
                    고르면 "작성일 ~ 종료일" 형식으로 자동 채워진다. */}
            <div>
              <Label>게시기간</Label>
              <div className="flex gap-1.5">
                <Popover open={postingPeriodOpen} onOpenChange={setPostingPeriodOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 h-9 justify-start text-left font-normal px-3"
                      data-testid="button-posting-period"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                      <span className="truncate">{resolvedPostingPeriod}</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <div className="p-2 pb-0 text-[11px] text-slate-500">
                      게시 종료일을 선택하면 "{format(noticeStartDate, "yyyy-MM-dd")} ~ 종료일" 로 표시됩니다.
                    </div>
                    <Calendar
                      mode="single"
                      selected={parsedEndDate}
                      defaultMonth={parsedEndDate ?? noticeStartDate}
                      fromDate={noticeStartDate}
                      onSelect={handlePickPostingEnd}
                      locale={ko}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                {postingPeriodOverride && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-9 px-2 shrink-0"
                    onClick={handleClearPostingPeriod}
                    data-testid="button-posting-period-reset"
                    title="상시게재로 되돌리기"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>본문</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleResetBody}
                  data-testid="button-reset-body"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />원본으로 되돌리기
                </Button>
              </div>
              {/* [Task #591] 위지윅 편집기 — 'filled' 모드에서 칩이 우리 건물의
                  실제값(건물명/주소/전화번호/날짜/사용자입력칸)으로 자동 치환되어
                  표시되며, body 상태에는 raw `{{token}}` 형태가 보존된다. */}
              {/* [Task #624] customA/B/C·date·notes·contact override 입력 칸은
                  사용 모달에서 제거됐다. 해당 상태값(기본값/공란)은 내부에 그대로
                  남겨 토큰 치환·미리보기·인쇄가 깨지지 않게 유지한다. */}
              <NoticeBodyEditor
                ref={editorRef}
                key={`manager-editor-${template.id}`}
                initialHtml={template.bodyHtml}
                mode="filled"
                values={tokenValues}
                customLabels={{ a: labels[0], b: labels[1], c: labels[2] }}
                onChange={handleBodyChange}
                testIdPrefix="editable-body"
                minHeightClassName="min-h-[280px]"
              />
            </div>

            {/* [Task #583] 사진 첨부 컨트롤 — 캡처 영역 밖에 두어 컨트롤 자체가 PNG/PDF/docx 에 포함되지 않게 한다. */}
            <div className="space-y-2" data-testid="photo-upload-controls">
              <Label className="text-xs">사진 첨부 (최대 2장, 다이얼로그를 닫으면 사라집니다)</Label>
              <div className="grid grid-cols-2 gap-2">
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    className="border rounded p-2 bg-slate-50 flex flex-col gap-2"
                    data-testid={`photo-upload-slot-${i}`}
                  >
                    <input
                      ref={photoInputRefs[i]}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      data-testid={`input-photo-${i}`}
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        handlePhotoChange(i, file);
                      }}
                    />
                    {photos[i] ? (
                      <>
                        <div className="aspect-[4/3] w-full bg-white border overflow-hidden flex items-center justify-center">
                          <img
                            src={photos[i] ?? ""}
                            alt={`첨부 사진 ${i + 1}`}
                            className="max-w-full max-h-full object-contain"
                          />
                        </div>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => openPhotoPicker(i)}
                            data-testid={`button-photo-replace-${i}`}
                          >
                            <Upload className="w-3.5 h-3.5 mr-1" />교체
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => handlePhotoRemove(i)}
                            data-testid={`button-photo-remove-${i}`}
                          >
                            <XIcon className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-24 w-full flex flex-col items-center justify-center gap-1"
                        onClick={() => openPhotoPicker(i)}
                        data-testid={`button-photo-add-${i}`}
                      >
                        <Upload className="w-4 h-4" />
                        <span className="text-xs">사진 {i + 1} 추가</span>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* [Task #591] 우측 미리보기 패널 — md+ 에서 sticky, 모바일에서는 폼 아래. */}
          <div className="px-1">
            <Label className="text-xs print:hidden">미리보기</Label>
            <div
              className="mt-1 border rounded bg-white p-3 overflow-x-auto md:sticky md:top-0 md:max-h-[80vh] md:overflow-y-auto print:border-0 print:p-0 print:overflow-visible print:max-h-none print:static"
              data-testid="container-template-preview"
            >
              <A4DocumentFrame ref={frameRef}>
                <div
                  ref={documentRef}
                  className="a4-document"
                  style={{ fontFamily: "'Noto Sans KR', 'Malgun Gothic', sans-serif" }}
                >
                  <NoticeLayoutFrame
                    settings={noticeLayout}
                    buildingName={building?.name ?? ""}
                    addressFull={building?.addressFull ?? null}
                    managementOfficePhone={building?.managementOfficePhone ?? null}
                    feeInquiryPhone={building?.feeInquiryPhone ?? null}
                    facilitySafetyPhone={building?.facilitySafetyPhone ?? null}
                    logoUrl={building?.logoUrl ?? null}
                    sealUrl={null}
                    noticeNo={noticeNo}
                    noticeDate={todayShort()}
                    postingPeriod={postingPeriodOverride ?? undefined}
                    contact={contactOverride ?? undefined}
                    title={title}
                    /*
                      [Task #608] 첨부 사진은 NoticeLayoutFrame 이 본문 슬롯 끝과
                        하단 푸터 슬롯에 자동 배치한다. 사진이 0장이면 어디에도
                        placeholder 가 그려지지 않는다.
                    */
                    photos={nonNullPhotos}
                  >
                    {/*
                      [Task #591] 본문 — 편집기에서 받은 raw 템플릿 HTML 을
                        renderNoticeBodyHtml 로 토큰 치환해 출력.
                    */}
                    <div
                      className="notice-template-body"
                      data-testid="preview-rendered"
                      dangerouslySetInnerHTML={{ __html: renderedHtml }}
                    />

                    {notesText && (
                      <div className="mt-4 text-sm">
                        <p className="font-semibold mb-1">■ 비고</p>
                        <p
                          className="whitespace-pre-line text-justify"
                          style={{ textJustify: "inter-word" }}
                        >
                          {notesText}
                        </p>
                      </div>
                    )}
                  </NoticeLayoutFrame>
                </div>
              </A4DocumentFrame>
            </div>
          </div>
        </div>

        <div className="a4-document-actions space-y-2 print:hidden">
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              onClick={handlePrint}
              data-testid="button-print"
              className="hidden md:inline-flex"
            >
              <Printer className="w-4 h-4 mr-2" />
              인쇄
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              onClick={handleShare}
              disabled={sharing}
              data-testid="button-share"
              className="h-auto w-full min-w-0 flex-col gap-1 px-1 py-2 text-[11px] leading-tight [&_svg]:size-4 sm:h-9 sm:flex-row sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
            >
              <Share2 />
              <span className="min-w-0 truncate">
                {sharing ? "공유 중..." : "외부 공유"}
              </span>
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadImage}
              disabled={exporting}
              data-testid="button-download-image"
              className="h-auto w-full min-w-0 flex-col gap-1 px-1 py-2 text-[11px] leading-tight [&_svg]:size-4 sm:h-9 sm:flex-row sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
            >
              <Download />
              <span className="min-w-0 truncate">
                {exporting ? "저장 중..." : "이미지 저장"}
              </span>
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadDoc}
              disabled={exportingDoc}
              data-testid="button-download-doc"
              className="h-auto w-full min-w-0 flex-col gap-1 px-1 py-2 text-[11px] leading-tight [&_svg]:size-4 sm:h-9 sm:flex-row sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
            >
              <FileText />
              <span className="min-w-0 truncate">
                {exportingDoc ? "저장 중..." : "문서로 저장"}
              </span>
            </Button>
          </div>
          {/* [Task #610] 공고문 → 기안서로 만들기 표준 진입.
              recordOutput("share") 으로 documents/notice_outputs upsert 후
              prefill 페이로드를 들고 /approvals/create 로 이동한다. */}
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              data-testid="button-notice-to-approval"
              onClick={() => {
                recordOutput("share");
                const qs = buildApprovalPrefillSearch({
                  kind: "notice_output",
                  sourceTable: "notice_outputs",
                  title: title || template.title,
                  buildingId: building?.id ?? null,
                  metadata: { templateId: template.id, outputDate: todayYmd() },
                });
                navigate(`/approvals/create?${qs.toString()}`);
              }}
            >
              <FileText className="w-4 h-4 mr-1" />
              기안서로 만들기
            </Button>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
