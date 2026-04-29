import { useEffect, useMemo, useRef, useState } from "react";
import { useListBuildingNoticeTemplates } from "@workspace/api-client-react";
import type { BuildingNoticeTemplate } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useNoticeLayout } from "@/hooks/use-notice-layout";
import { fillNoticeTemplate, renderNoticeBodyHtml } from "@/lib/notice-layout";
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
  const { data, isLoading } = useListBuildingNoticeTemplates();
  const templates: BuildingNoticeTemplate[] = data?.templates ?? [];
  const categories = useMemo(() => {
    const set = new Set(templates.map((t) => t.category));
    return ["전체", ...Array.from(set)];
  }, [templates]);
  const [activeCategory, setActiveCategory] = useState("전체");
  const filtered = templates.filter((t) => activeCategory === "전체" || t.category === activeCategory);
  const [selected, setSelected] = useState<BuildingNoticeTemplate | null>(null);

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

      <div className="flex flex-wrap gap-2" data-testid="filter-categories">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setActiveCategory(c)}
            className={`px-3 py-1.5 rounded-full text-xs border ${
              activeCategory === c
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
            data-testid={`filter-category-${c}`}
          >
            {c}
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
          {filtered.map((t) => (
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
                  <Badge variant="outline" className="text-[10px] mb-1">{t.category}</Badge>
                  <div className="font-semibold text-sm line-clamp-2">{t.title}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <PreviewDialog template={selected} onClose={() => setSelected(null)} />
      )}
    </div>
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
  const [editMode, setEditMode] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [exportingDoc, setExportingDoc] = useState(false);
  // 공고NO 는 다이얼로그가 열릴 때 한 번 채번해 캡처/공유 동안 일정하게 유지.
  const [noticeNo] = useState(generateNoticeNo);

  const documentRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<A4DocumentFrameHandle>(null);

  // [Task #583] 본문 HTML 토큰 치환 결과. customA/B/C 또는 date 가 바뀌면
  //   bodyDirty=false 인 경우에만 자동 재채움 — 사용자가 한 번이라도 본문을
  //   수정했다면 잠그고, "원본으로 되돌리기" 로만 다시 토큰 치환을 적용한다.
  const renderedHtml = useMemo(
    () =>
      renderNoticeBodyHtml(template.bodyHtml, {
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
    [template, building, date, customA, customB, customC],
  );
  const [body, setBody] = useState(renderedHtml);
  const [bodyDirty, setBodyDirty] = useState(false);

  useEffect(() => {
    if (!bodyDirty) setBody(renderedHtml);
  }, [renderedHtml, bodyDirty]);

  function handleResetBody() {
    setBody(renderedHtml);
    setBodyDirty(false);
  }

  function handleBodyChange(v: string) {
    setBody(v);
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

  // [Task #583] 캡처 직전 편집 모드를 닫고 A4DocumentFrame 의 transform 을
  //   풀어주는 헬퍼 — CompletionNotice 와 동일한 패턴.
  async function withReadyDocument<T>(fn: () => Promise<T> | T): Promise<T> {
    setEditMode(false);
    await new Promise((r) => setTimeout(r, 120));
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
    });
  }

  async function handleDownloadImage() {
    if (!documentRef.current) return;
    setExporting(true);
    try {
      await withReadyDocument(async () => {
        if (!documentRef.current) return;
        await downloadElementAsPng(documentRef.current, filename);
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
          toast({ title: "공유 시작", description: "원하는 앱으로 보내주세요." });
        } else if (result === "downloaded") {
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

  const resolvedContact =
    contactOverride ??
    fillNoticeTemplate(noticeLayout.contactTemplate, {
      buildingName: building?.name ?? "",
      managementOfficePhone: building?.managementOfficePhone,
      feeInquiryPhone: building?.feeInquiryPhone,
      facilitySafetyPhone: building?.facilitySafetyPhone,
    });
  const resolvedPostingPeriod = postingPeriodOverride ?? noticeLayout.defaultPostingPeriod;

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto print:max-w-none print:shadow-none print:border-none">
        <ResponsiveDialogHeader className="print:hidden">
          <ResponsiveDialogTitle>
            <span className="mr-2">{template.icon ?? "📄"}</span>
            {template.title}
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        {editMode && (
          <div className="space-y-3 border-b pb-4 mb-2 print:hidden">
            <div>
              <Label>제목</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                data-testid="input-title"
              />
            </div>

            {labels.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {labels[0] && (
                  <div>
                    <Label className="text-xs">{labels[0]}</Label>
                    <Input
                      value={customA}
                      onChange={(e) => setCustomA(e.target.value)}
                      placeholder={labels[0]}
                      data-testid="input-custom-a"
                    />
                  </div>
                )}
                {labels[1] && (
                  <div>
                    <Label className="text-xs">{labels[1]}</Label>
                    <Input
                      value={customB}
                      onChange={(e) => setCustomB(e.target.value)}
                      placeholder={labels[1]}
                      data-testid="input-custom-b"
                    />
                  </div>
                )}
                {labels[2] && (
                  <div className="sm:col-span-2">
                    <Label className="text-xs">{labels[2]}</Label>
                    <Input
                      value={customC}
                      onChange={(e) => setCustomC(e.target.value)}
                      placeholder={labels[2]}
                      data-testid="input-custom-c"
                    />
                  </div>
                )}
              </div>
            )}

            <div>
              <Label className="text-xs">날짜</Label>
              <Input
                value={date}
                onChange={(e) => setDate(e.target.value)}
                data-testid="input-date"
              />
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
              <Textarea
                value={body}
                onChange={(e) => handleBodyChange(e.target.value)}
                rows={8}
                data-testid="editable-body"
              />
            </div>

            <div>
              <Label>비고</Label>
              <Textarea
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                rows={2}
                data-testid="input-notes"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>게시기간</Label>
                <Input
                  value={resolvedPostingPeriod}
                  onChange={(e) => setPostingPeriodOverride(e.target.value)}
                  data-testid="input-posting-period"
                />
              </div>
              <div>
                <Label>관리사무소 연락처</Label>
                <Input
                  value={resolvedContact}
                  onChange={(e) => setContactOverride(e.target.value)}
                  data-testid="input-contact"
                />
              </div>
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
        )}

        <A4DocumentFrame ref={frameRef}>
          <div
            ref={documentRef}
            className="a4-document"
            style={{ fontFamily: "'Noto Sans KR', 'Malgun Gothic', sans-serif" }}
          >
            <NoticeLayoutFrame
              settings={noticeLayout}
              buildingName={building?.name ?? ""}
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
            >
              {/*
                [Task #583] 사진 영역 — 본문 위에 위치, 항상 2칸 분량을 점유.
                  사진이 0/1/2 장이든 동일한 높이를 차지하므로 본문 시작 y 좌표가 흔들리지 않는다.
              */}
              <div
                className="grid grid-cols-2 gap-3 mb-4"
                data-testid="notice-photo-area"
                aria-label="첨부 사진 영역"
              >
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    className="aspect-[4/3] border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden"
                    data-testid={`notice-photo-slot-${i}`}
                  >
                    {photos[i] ? (
                      <img
                        src={photos[i] ?? ""}
                        alt=""
                        className="w-full h-full object-contain bg-white"
                      />
                    ) : (
                      <span className="text-[11px] text-slate-400 select-none">사진 없음</span>
                    )}
                  </div>
                ))}
              </div>

              {/*
                [Task #583] 본문 — 템플릿 HTML 토큰 치환 결과를 그대로 출력.
                  편집 모드의 textarea 가 body 상태를 갱신하면 미리보기에도 즉시 반영된다.
              */}
              <div
                className="notice-template-body"
                data-testid="preview-rendered"
                dangerouslySetInnerHTML={{ __html: body }}
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

        <div className="a4-document-actions space-y-2 print:hidden">
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditMode((v) => !v)}
              data-testid="btn-toggle-edit"
            >
              {editMode ? "미리보기" : "수정"}
            </Button>
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
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
