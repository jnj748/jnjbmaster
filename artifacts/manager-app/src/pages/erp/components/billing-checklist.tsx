import React, { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, Circle, Upload, FileText, FileSpreadsheet,
  FileImage, AlertTriangle, Rocket, ChevronRight, X,
  Eye, FolderOpen, Zap, Clock, ShieldCheck
} from "lucide-react";
import { toast } from "sonner";

type FileStatus = "pending" | "uploaded" | "warning";

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: Date;
  warning?: string;
}

interface Category {
  id: string;
  label: string;
  description: string;
  required: boolean;
  keywords: RegExp[];
  status: FileStatus;
  files: UploadedFile[];
}

const INITIAL_CATEGORIES: Category[] = [
  {
    id: "bank",
    label: "통장 거래내역",
    description: "하나·농협·우리·국민은행 거래내역 엑셀/CSV",
    required: true,
    keywords: [/거래내역/i, /통장/i, /씨엘뷰/i, /하나bank/i, /농협/i, /우리은행/i, /국민은행/i, /transaction/i],
    status: "uploaded",
    files: [
      {
        id: "f1",
        name: "씨엘뷰 거래내역조회 202602.xlsx",
        size: 48320,
        type: "xlsx",
        uploadedAt: new Date("2026-03-01T09:12:00"),
      }
    ]
  },
  {
    id: "energy",
    label: "에너지 검침 자료",
    description: "수도·열요금·전기 검침 내역서",
    required: true,
    keywords: [/검침/i, /수도/i, /열요금/i, /전기/i, /상하수도/i, /에너지/i, /meter/i, /water/i],
    status: "uploaded",
    files: [
      {
        id: "f2",
        name: "상하수도 검침내역 2026-02.csv",
        size: 12840,
        type: "csv",
        uploadedAt: new Date("2026-03-01T10:05:00"),
      }
    ]
  },
  {
    id: "service",
    label: "부가 서비스 자료",
    description: "TV 보유 세대 리스트·주차비 내역",
    required: true,
    keywords: [/tv/i, /티비/i, /케이블/i, /주차/i, /보유세대/i, /주차비/i, /cable/i],
    status: "uploaded",
    files: [
      {
        id: "f3",
        name: "TV보유세대 목록 2026-02.xlsx",
        size: 9216,
        type: "xlsx",
        uploadedAt: new Date("2026-03-01T10:30:00"),
        warning: undefined,
      }
    ]
  },
  {
    id: "accounting",
    label: "회계 증빙 자료",
    description: "부과자료 PDF·고지서 참고사항",
    required: false,
    keywords: [/부과자료/i, /고지서/i, /증빙/i, /invoice/i, /billing/i, /영수증/i],
    status: "pending",
    files: []
  },
  {
    id: "admin",
    label: "기타 행정 자료",
    description: "관리단 회의록·미납대장·부속명세서",
    required: false,
    keywords: [/회의록/i, /미납/i, /부속/i, /명세서/i, /minutes/i, /unpaid/i, /관리단/i],
    status: "pending",
    files: []
  }
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(ext: string) {
  if (["xlsx", "xls", "csv"].includes(ext)) return <FileSpreadsheet className="w-4 h-4 text-green-400" />;
  if (["pdf"].includes(ext)) return <FileText className="w-4 h-4 text-red-400" />;
  if (["jpg", "png", "jpeg"].includes(ext)) return <FileImage className="w-4 h-4 text-blue-400" />;
  return <FileText className="w-4 h-4 text-muted-foreground" />;
}

function detectCategory(filename: string, categories: Category[]): string | null {
  const lower = filename.toLowerCase();
  for (const cat of categories) {
    if (cat.keywords.some(kw => kw.test(lower))) return cat.id;
  }
  return null;
}

export default function BillingChecklist() {
  const [categories, setCategories] = useState<Category[]>(INITIAL_CATEGORIES);
  const [isDragging, setIsDragging] = useState(false);
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const requiredCategories = categories.filter(c => c.required);
  const uploadedRequired = requiredCategories.filter(c => c.status === "uploaded" || c.status === "warning");
  const totalCategories = categories.length;
  const uploadedTotal = categories.filter(c => c.status !== "pending").length;
  const progressPct = Math.round((uploadedTotal / totalCategories) * 100);
  const canStart = uploadedRequired.length === requiredCategories.length;

  const processFiles = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    let matchedCount = 0;
    let unmatchedCount = 0;

    setCategories(prev => {
      const next = [...prev.map(c => ({ ...c, files: [...c.files] }))];
      for (const f of files) {
        const ext = f.name.split(".").pop()?.toLowerCase() ?? "file";
        const catId = detectCategory(f.name, next);
        const newFile: UploadedFile = {
          id: `${Date.now()}-${Math.random()}`,
          name: f.name,
          size: f.size,
          type: ext,
          uploadedAt: new Date(),
        };

        if (catId) {
          const cat = next.find(c => c.id === catId)!;
          cat.files.push(newFile);
          cat.status = "uploaded";
          matchedCount++;
        } else {
          unmatchedCount++;
          const admin = next.find(c => c.id === "admin")!;
          admin.files.push({ ...newFile, warning: "카테고리 자동 감지 불가 — 기타 자료로 분류" });
          admin.status = "uploaded";
        }
      }
      return next;
    });

    if (matchedCount > 0) toast.success(`${matchedCount}개 파일이 자동으로 분류되었습니다.`);
    if (unmatchedCount > 0) toast.warning(`${unmatchedCount}개 파일은 카테고리를 인식하지 못해 기타 자료로 분류되었습니다.`);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) processFiles(e.target.files);
  };

  const removeFile = (catId: string, fileId: string) => {
    setCategories(prev => prev.map(c => {
      if (c.id !== catId) return c;
      const nextFiles = c.files.filter(f => f.id !== fileId);
      return { ...c, files: nextFiles, status: nextFiles.length > 0 ? "uploaded" : "pending" };
    }));
  };

  const handleEngineStart = () => {
    toast.success("부과 엔진 가동! 배분 엔진 탭으로 이동하여 금액을 입력하세요.", { duration: 4000 });
  };

  const MONTH = "2026년 2월";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            {MONTH} 부과 작업 준비 현황
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            필수 소스 파일이 모두 업로드되어야 부과 엔진을 가동할 수 있습니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">전체 준비율</p>
            <p className="text-2xl font-bold font-mono text-primary">{progressPct}%</p>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <span>업로드 진행 ({uploadedTotal}/{totalCategories} 카테고리)</span>
          <span className="font-mono">필수 {uploadedRequired.length}/{requiredCategories.length} 완료</span>
        </div>
        <div className="h-2.5 w-full bg-secondary/30 rounded-full overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${progressPct === 100 ? "bg-green-500" : progressPct >= 60 ? "bg-primary" : "bg-amber-500"}`}
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Main 2-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* LEFT: Checklist */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
            <FolderOpen className="w-3.5 h-3.5" /> 자료 카테고리 현황
          </p>
          {categories.map((cat, i) => (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className={`border transition-colors ${cat.status === "uploaded" ? "border-primary/30 bg-primary/5" : cat.status === "warning" ? "border-amber-500/30 bg-amber-500/5" : "border-border/50 bg-card/50"}`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex-shrink-0">
                      {cat.status === "uploaded" ? (
                        <CheckCircle2 className="w-5 h-5 text-primary" />
                      ) : cat.status === "warning" ? (
                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                      ) : (
                        <Circle className="w-5 h-5 text-muted-foreground/30" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">{cat.label}</span>
                        {cat.required && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-red-500/40 text-red-400 bg-red-500/5">필수</Badge>
                        )}
                        {cat.status === "uploaded" && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-primary/40 text-primary bg-primary/5">
                            완료 ({cat.files.length}개)
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{cat.description}</p>

                      {/* File list under category */}
                      {cat.files.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {cat.files.map(file => (
                            <div key={file.id} className="flex items-center gap-2 bg-background/60 border border-border/40 rounded-md px-2.5 py-1.5 group">
                              {getFileIcon(file.type)}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-foreground truncate">{file.name}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {file.type.toUpperCase()} · {formatBytes(file.size)} · {file.uploadedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                                </p>
                                {file.warning && (
                                  <p className="text-[10px] text-amber-500 flex items-center gap-1 mt-0.5">
                                    <AlertTriangle className="w-2.5 h-2.5" /> {file.warning}
                                  </p>
                                )}
                              </div>
                              <button
                                onClick={() => setPreviewFile(file)}
                                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => removeFile(cat.id, file.id)}
                                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* RIGHT: Upload Area + File hints */}
        <div className="space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" /> 파일 업로드
          </p>

          {/* Drag & Drop Zone */}
          <div
            className={`relative border-2 border-dashed rounded-xl transition-all duration-200 cursor-pointer
              ${isDragging ? "border-primary bg-primary/10 scale-[1.01]" : "border-border/50 bg-card/30 hover:border-primary/50 hover:bg-primary/5"}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileInput}
              accept=".xlsx,.xls,.csv,.pdf,.jpg,.png,.docx,.hwp"
            />
            <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
              <motion.div
                animate={isDragging ? { scale: 1.15, y: -4 } : { scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 300 }}
                className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 border-2
                  ${isDragging ? "border-primary bg-primary/20" : "border-border/50 bg-secondary/30"}`}
              >
                <Upload className={`w-6 h-6 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
              </motion.div>
              <p className="font-semibold text-foreground text-sm">
                {isDragging ? "놓으면 업로드됩니다" : "파일을 드래그하거나 클릭하여 업로드"}
              </p>
              <p className="text-xs text-muted-foreground mt-1.5">
                Excel, CSV, PDF, 이미지 · 다중 파일 동시 업로드 지원
              </p>
              <p className="text-xs text-primary/70 mt-2 font-medium">
                파일명에 키워드가 포함되면 자동으로 분류됩니다
              </p>
            </div>
          </div>

          {/* Keyword Guide */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" /> 자동 분류 키워드 안내
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="space-y-2">
                {[
                  { label: "통장 거래내역", keywords: ["거래내역", "통장", "씨엘뷰", "농협", "하나bank"] },
                  { label: "에너지 검침", keywords: ["검침", "수도", "열요금", "전기", "상하수도"] },
                  { label: "부가 서비스", keywords: ["TV", "케이블", "주차", "보유세대"] },
                  { label: "회계 증빙", keywords: ["부과자료", "고지서", "증빙", "영수증"] },
                  { label: "기타 행정", keywords: ["회의록", "미납", "명세서", "관리단"] },
                ].map(item => (
                  <div key={item.label} className="flex items-start gap-2">
                    <span className="text-[10px] text-muted-foreground w-20 flex-shrink-0 pt-0.5">{item.label}</span>
                    <div className="flex flex-wrap gap-1">
                      {item.keywords.map(kw => (
                        <Badge key={kw} variant="secondary" className="text-[10px] h-4 px-1.5 bg-secondary/50 text-muted-foreground font-normal">
                          {kw}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Upload Timeline */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> 업로드 타임라인
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              {categories.flatMap(c => c.files.map(f => ({ ...f, catLabel: c.label }))).length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">업로드된 파일이 없습니다</p>
              ) : (
                <div className="space-y-1.5">
                  {categories
                    .flatMap(c => c.files.map(f => ({ ...f, catLabel: c.label })))
                    .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
                    .map(f => (
                      <div key={f.id} className="flex items-center gap-2 text-xs">
                        {getFileIcon(f.type)}
                        <span className="flex-1 truncate text-foreground">{f.name}</span>
                        <Badge variant="outline" className="text-[9px] h-4 px-1 border-border/50 text-muted-foreground shrink-0">{f.catLabel}</Badge>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom CTA */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card className={`border transition-colors ${canStart ? "border-primary/40 bg-primary/5" : "border-border/50 bg-card/30"}`}>
          <CardContent className="py-4 px-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${canStart ? "bg-primary/20 border border-primary/30" : "bg-secondary/30 border border-border/50"}`}>
                  {canStart ? <Rocket className="w-5 h-5 text-primary" /> : <AlertTriangle className="w-5 h-5 text-muted-foreground/50" />}
                </div>
                <div>
                  {canStart ? (
                    <>
                      <p className="text-sm font-semibold text-foreground">모든 필수 소스가 확인되었습니다.</p>
                      <p className="text-xs text-muted-foreground mt-0.5">부과 엔진을 가동하시겠습니까? 배분 엔진 탭에서 금액을 입력하면 부과총괄표가 자동 생성됩니다.</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-foreground">필수 자료가 아직 부족합니다.</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        미업로드 항목: {requiredCategories.filter(c => c.status === "pending").map(c => c.label).join(", ")}
                      </p>
                    </>
                  )}
                </div>
              </div>
              <Button
                onClick={handleEngineStart}
                disabled={!canStart}
                className={`gap-2 font-semibold shrink-0 ${canStart ? "bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25" : ""}`}
                size="lg"
              >
                <Rocket className="w-4 h-4" />
                부과 생성 시작
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Preview Modal */}
      <AnimatePresence>
        {previewFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            onClick={() => setPreviewFile(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-card border border-border/50 rounded-xl shadow-2xl max-w-md w-full p-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {getFileIcon(previewFile.type)}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{previewFile.name}</h3>
                    <p className="text-xs text-muted-foreground">{previewFile.type.toUpperCase()} · {formatBytes(previewFile.size)}</p>
                  </div>
                </div>
                <button onClick={() => setPreviewFile(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="bg-secondary/20 rounded-lg border border-border/50 p-8 flex flex-col items-center justify-center gap-3">
                {getFileIcon(previewFile.type)}
                <p className="text-sm text-muted-foreground text-center">
                  미리보기는 실제 파일 업로드 시 지원됩니다.<br />
                  현재는 시뮬레이션 데이터입니다.
                </p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div className="bg-secondary/20 rounded-md p-2.5">
                  <p className="text-[10px] uppercase tracking-wider mb-0.5">업로드 시각</p>
                  <p className="font-medium text-foreground">
                    {previewFile.uploadedAt.toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="bg-secondary/20 rounded-md p-2.5">
                  <p className="text-[10px] uppercase tracking-wider mb-0.5">파일 크기</p>
                  <p className="font-medium text-foreground">{formatBytes(previewFile.size)}</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
