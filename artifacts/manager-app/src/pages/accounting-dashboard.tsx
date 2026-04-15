import { useState, useMemo, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "wouter";
import {
  useGetDashboardSummary,
  useGetApprovalCheck,
  useGetIncompleteUnits,
  useCalculateFees,
} from "@workspace/api-client-react";
import type { CalculateFeesResponse } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardCheck,
  DollarSign,
  Calculator,
  Coins,
  FileText,
  Send,
  ClipboardList,
  ChevronRight,
  BookOpen,
  BarChart3,
  Settings,
  AlertTriangle,
  CheckCircle2,
  GripVertical,
  ArrowRight,
  ShieldCheck,
  XCircle,
  Upload,
  File,
  X,
} from "lucide-react";

interface MenuCard {
  path: string;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  badge?: string;
  badgeVariant?: "default" | "destructive" | "secondary" | "outline";
}

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

function formatKrw(n: number) {
  return new Intl.NumberFormat("ko-KR").format(n);
}

interface ChecklistItem {
  id: string;
  label: string;
  category: "필수" | "권장" | "선택";
  checked: boolean;
}

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: "area", label: "전유면적 데이터 확인", category: "필수", checked: false },
  { id: "tenantCards", label: "입주자카드 전수 확인", category: "필수", checked: false },
  { id: "meterReading", label: "검침 데이터 입력 완료", category: "필수", checked: false },
  { id: "approvalDone", label: "해당월 결재 완료 확인", category: "필수", checked: false },
  { id: "utilityBills", label: "공과금 고지서 수령 확인", category: "권장", checked: false },
  { id: "vendorInvoices", label: "협력업체 세금계산서 확인", category: "권장", checked: false },
  { id: "priorMonth", label: "전월 미수금 확인", category: "선택", checked: false },
  { id: "specialRepair", label: "장기수선계획 반영 확인", category: "선택", checked: false },
];

type DocCategory = "통장거래내역" | "에너지검침" | "부가서비스" | "회계증빙" | "기타";

interface UploadedDoc {
  id: string;
  name: string;
  size: number;
  category: DocCategory;
}

const CATEGORY_RULES: Array<{ pattern: RegExp; category: DocCategory }> = [
  { pattern: /통장|거래내역|입출금|계좌|bank/i, category: "통장거래내역" },
  { pattern: /검침|에너지|전기|수도|가스|난방|meter|energy/i, category: "에너지검침" },
  { pattern: /부가|서비스|주차|인터넷|wifi|cctv/i, category: "부가서비스" },
  { pattern: /영수증|세금계산서|인보이스|invoice|receipt|증빙/i, category: "회계증빙" },
];

function classifyFile(filename: string): DocCategory {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(filename)) return rule.category;
  }
  return "기타";
}

const CATEGORY_COLORS: Record<DocCategory, string> = {
  "통장거래내역": "bg-blue-100 text-blue-700",
  "에너지검침": "bg-green-100 text-green-700",
  "부가서비스": "bg-purple-100 text-purple-700",
  "회계증빙": "bg-orange-100 text-orange-700",
  "기타": "bg-gray-100 text-gray-700",
};

export default function AccountingDashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary();
  const [month] = useState(currentMonth());
  const { data: approvalCheck } = useGetApprovalCheck({ month });
  const { data: incompleteUnits = [] } = useGetIncompleteUnits();
  const { toast } = useToast();

  const [checklist, setChecklist] = useState<ChecklistItem[]>(DEFAULT_CHECKLIST);
  const [dragId, setDragId] = useState<string | null>(null);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback((files: FileList | File[]) => {
    const newDocs: UploadedDoc[] = Array.from(files).map(f => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: f.name,
      size: f.size,
      category: classifyFile(f.name),
    }));
    setUploadedDocs(prev => [...prev, ...newDocs]);
    toast({ title: `${newDocs.length}개 파일 업로드, 자동 분류 완료` });
  }, [toast]);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  }, [processFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      e.target.value = "";
    }
  }, [processFiles]);

  function removeDoc(id: string) {
    setUploadedDocs(prev => prev.filter(d => d.id !== id));
  }

  function updateDocCategory(id: string, category: DocCategory) {
    setUploadedDocs(prev => prev.map(d => d.id === id ? { ...d, category } : d));
  }

  const docsByCategory = useMemo(() => {
    const grouped: Record<DocCategory, UploadedDoc[]> = {
      "통장거래내역": [], "에너지검침": [], "부가서비스": [], "회계증빙": [], "기타": [],
    };
    for (const doc of uploadedDocs) {
      grouped[doc.category].push(doc);
    }
    return grouped;
  }, [uploadedDocs]);

  const [calcForm, setCalcForm] = useState({
    commonMaintenanceFee: "3000000",
    specialFund: "500000",
    utilityTotal: "1500000",
    specialSurcharge: "0",
    splitHighCostRepairs: false,
    amortizationMonths: "12",
  });

  const calcMutation = useCalculateFees();
  const [calcResult, setCalcResult] = useState<CalculateFeesResponse | null>(null);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);

  const requiredDone = useMemo(() => {
    return checklist.filter(c => c.category === "필수").every(c => c.checked);
  }, [checklist]);

  const completionRate = useMemo(() => {
    const done = checklist.filter(c => c.checked).length;
    return Math.round((done / checklist.length) * 100);
  }, [checklist]);

  function toggleCheck(id: string) {
    setChecklist(prev =>
      prev.map(item => item.id === id ? { ...item, checked: !item.checked } : item)
    );
  }

  function handleDragStart(id: string) {
    setDragId(id);
  }

  function handleDragOver(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;
    setChecklist(prev => {
      const items = [...prev];
      const fromIdx = items.findIndex(i => i.id === dragId);
      const toIdx = items.findIndex(i => i.id === targetId);
      const [moved] = items.splice(fromIdx, 1);
      items.splice(toIdx, 0, moved);
      return items;
    });
  }

  async function handleCalculate() {
    if (!requiredDone) {
      toast({ title: "필수 체크리스트를 먼저 완료해주세요", variant: "destructive" });
      return;
    }

    if (approvalCheck && !approvalCheck.allApproved) {
      setApprovalDialogOpen(true);
      return;
    }

    try {
      const result = await calcMutation.mutateAsync({
        data: {
          month,
          commonMaintenanceFee: Number(calcForm.commonMaintenanceFee),
          specialFund: Number(calcForm.specialFund),
          utilityTotal: Number(calcForm.utilityTotal),
          specialSurcharge: Number(calcForm.specialSurcharge),
          splitHighCostRepairs: calcForm.splitHighCostRepairs,
          amortizationMonths: calcForm.splitHighCostRepairs ? Number(calcForm.amortizationMonths) : undefined,
        },
      });
      setCalcResult(result);
      toast({ title: `${result.totalUnits}세대 관리비 산출 완료` });
    } catch {
      toast({ title: "산출에 실패했습니다", variant: "destructive" });
    }
  }

  const menuCards: MenuCard[] = [
    {
      path: "/approvals",
      label: "결재함",
      description: "결재 대기 및 처리 현황",
      icon: ClipboardCheck,
      color: "bg-blue-500",
      badge: summary?.pendingApprovalCount ? `${summary.pendingApprovalCount}건 대기` : undefined,
      badgeVariant: "destructive",
    },
    {
      path: "/spending",
      label: "지출 현황",
      description: "관리비 지출 내역 관리",
      icon: DollarSign,
      color: "bg-emerald-500",
    },
    {
      path: "/tax-schedules",
      label: "세무 일정",
      description: "세금 납부 및 신고 일정",
      icon: Calculator,
      color: "bg-orange-500",
      badge: summary?.pendingTaxCount ? `${summary.pendingTaxCount}건 예정` : undefined,
      badgeVariant: "secondary",
    },
    {
      path: "/drafts",
      label: "기안서",
      description: "기안서 작성 및 관리",
      icon: ClipboardList,
      color: "bg-violet-500",
    },
    {
      path: "/commissions",
      label: "수수료",
      description: "협력업체 수수료 관리",
      icon: Coins,
      color: "bg-amber-500",
    },
    {
      path: "/rfqs",
      label: "견적 요청",
      description: "견적 요청 및 비교",
      icon: Send,
      color: "bg-cyan-500",
    },
    {
      path: "/work-reports",
      label: "작업 검수",
      description: "작업 완료 검수 관리",
      icon: FileText,
      color: "bg-teal-500",
    },
    {
      path: "/daily-reports",
      label: "일간보고",
      description: "일일 업무 보고서",
      icon: BookOpen,
      color: "bg-indigo-500",
    },
    {
      path: "/reports",
      label: "주간보고",
      description: "주간 종합 보고서",
      icon: FileText,
      color: "bg-pink-500",
    },
    {
      path: "/report-system",
      label: "보고 체계",
      description: "보고 체계 설정 및 관리",
      icon: BarChart3,
      color: "bg-slate-500",
    },
    {
      path: "/document-templates",
      label: "서식 관리",
      description: "문서 서식 및 템플릿",
      icon: Settings,
      color: "bg-gray-500",
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <div>
        <h1 className="text-2xl font-bold">관리비회계</h1>
        <p className="text-muted-foreground text-sm mt-1">
          관리비 산출, 결재, 세무 등 회계 업무를 통합 관리합니다
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-3 sm:p-4 text-center">
            <p className="text-xs text-blue-600 font-medium">결재 대기</p>
            <p className="text-2xl font-bold text-blue-700 mt-1">{summary?.pendingApprovalCount ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-orange-50 border-orange-200">
          <CardContent className="p-3 sm:p-4 text-center">
            <p className="text-xs text-orange-600 font-medium">세무 예정</p>
            <p className="text-2xl font-bold text-orange-700 mt-1">{summary?.pendingTaxCount ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-3 sm:p-4 text-center">
            <p className="text-xs text-emerald-600 font-medium">이번달 지출</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">{summary?.monthlySpendingCount ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="checklist" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="checklist" className="flex items-center gap-1.5">
            <ClipboardCheck className="w-4 h-4" />
            부과 전 체크리스트
          </TabsTrigger>
          <TabsTrigger value="engine" className="flex items-center gap-1.5">
            <Calculator className="w-4 h-4" />
            관리비 산출 엔진
          </TabsTrigger>
        </TabsList>

        <TabsContent value="checklist" className="mt-4 space-y-4">
          {incompleteUnits.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="border-amber-300 bg-amber-50">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-2 w-full">
                      <p className="text-sm font-semibold text-amber-800">
                        데이터 미비 세대 {incompleteUnits.length}건
                      </p>
                      <div className="space-y-1">
                        {incompleteUnits.slice(0, 5).map((u, i) => (
                          <div key={i} className="flex justify-between text-xs text-amber-700">
                            <span>{u.unitNumber}호</span>
                            <span>{u.issue}</span>
                          </div>
                        ))}
                        {incompleteUnits.length > 5 && (
                          <p className="text-xs text-amber-600">외 {incompleteUnits.length - 5}건...</p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  부과 전 점검 항목 ({month})
                </CardTitle>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-24 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${completionRate}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{completionRate}%</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              <AnimatePresence>
                {checklist.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    draggable
                    onDragStart={() => handleDragStart(item.id)}
                    onDragOver={(e) => handleDragOver(e as unknown as React.DragEvent, item.id)}
                    onDragEnd={() => setDragId(null)}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-grab active:cursor-grabbing transition-colors ${
                      item.checked ? "bg-emerald-50 border-emerald-200" : "bg-white hover:bg-gray-50"
                    } ${dragId === item.id ? "opacity-50" : ""}`}
                  >
                    <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => toggleCheck(item.id)}
                      className="w-4 h-4 rounded accent-emerald-600"
                    />
                    <span className={`flex-1 text-sm ${item.checked ? "line-through text-muted-foreground" : ""}`}>
                      {item.label}
                    </span>
                    <Badge
                      variant={item.category === "필수" ? "destructive" : item.category === "권장" ? "secondary" : "outline"}
                      className="text-[10px]"
                    >
                      {item.category}
                    </Badge>
                  </motion.div>
                ))}
              </AnimatePresence>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="w-4 h-4" />
                증빙 서류 업로드
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                accept=".pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.doc,.docx"
              />
              <div
                onDrop={handleFileDrop}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  isDragOver ? "border-primary bg-primary/5" : "border-gray-300 hover:border-gray-400"
                }`}
              >
                <Upload className={`w-8 h-8 mx-auto mb-2 ${isDragOver ? "text-primary" : "text-muted-foreground"}`} />
                <p className="text-sm font-medium">파일을 드래그하거나 클릭하여 업로드</p>
                <p className="text-xs text-muted-foreground mt-1">
                  파일명 기반 자동 분류: 통장거래내역, 에너지검침, 부가서비스, 회계증빙
                </p>
              </div>

              {uploadedDocs.length > 0 && (
                <div className="space-y-3">
                  {(Object.entries(docsByCategory) as [DocCategory, UploadedDoc[]][])
                    .filter(([, docs]) => docs.length > 0)
                    .map(([cat, docs]) => (
                      <div key={cat}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <Badge className={`text-[10px] ${CATEGORY_COLORS[cat]}`}>{cat}</Badge>
                          <span className="text-xs text-muted-foreground">{docs.length}건</span>
                        </div>
                        <div className="space-y-1">
                          {docs.map(doc => (
                            <div key={doc.id} className="flex items-center gap-2 p-2 rounded border bg-white text-xs">
                              <File className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="flex-1 truncate">{doc.name}</span>
                              <span className="text-muted-foreground shrink-0">
                                {doc.size < 1024 ? `${doc.size}B` : `${Math.round(doc.size / 1024)}KB`}
                              </span>
                              <select
                                value={doc.category}
                                onChange={(e) => updateDocCategory(doc.id, e.target.value as DocCategory)}
                                className="text-[10px] border rounded px-1 py-0.5 bg-white"
                              >
                                <option value="통장거래내역">통장거래내역</option>
                                <option value="에너지검침">에너지검침</option>
                                <option value="부가서비스">부가서비스</option>
                                <option value="회계증빙">회계증빙</option>
                                <option value="기타">기타</option>
                              </select>
                              <button onClick={() => removeDoc(doc.id)} className="text-muted-foreground hover:text-red-500">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>

          {approvalCheck && (
            <Card className={approvalCheck.allApproved ? "border-emerald-200" : "border-amber-200"}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  {approvalCheck.allApproved ? (
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-semibold">
                      {approvalCheck.allApproved
                        ? "모든 결재가 완료되었습니다"
                        : `미결재 ${approvalCheck.pending}건 / 반려 ${approvalCheck.rejected}건`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      전체 {approvalCheck.total}건 중 승인 {approvalCheck.approved}건
                    </p>
                  </div>
                  {!approvalCheck.allApproved && (
                    <Link href="/approvals">
                      <Button variant="outline" size="sm">
                        결재함 이동 <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                    </Link>
                  )}
                </div>
                {approvalCheck.unapprovedItems && approvalCheck.unapprovedItems.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {approvalCheck.unapprovedItems.slice(0, 3).map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-xs p-2 bg-white rounded border">
                        <span>{item.title}</span>
                        <div className="flex items-center gap-2">
                          {item.estimatedAmount && (
                            <span className="text-muted-foreground">{formatKrw(item.estimatedAmount)}원</span>
                          )}
                          <Badge variant={item.status === "rejected" ? "destructive" : "secondary"} className="text-[10px]">
                            {item.status === "pending" ? "대기" : item.status === "in_progress" ? "진행중" : "반려"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {requiredDone && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Card className="border-emerald-300 bg-emerald-50">
                <CardContent className="p-4 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <p className="text-sm font-medium text-emerald-800">
                    필수 체크리스트 완료! 관리비 산출 탭으로 이동하세요.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </TabsContent>

        <TabsContent value="engine" className="mt-4 space-y-4">
          {!requiredDone && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-4 flex items-center gap-3">
                <XCircle className="w-5 h-5 text-red-500" />
                <p className="text-sm text-red-700">
                  필수 체크리스트를 먼저 완료해야 산출할 수 있습니다
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">관리비 산출 설정</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">공용관리비 (원)</Label>
                  <Input
                    type="number"
                    value={calcForm.commonMaintenanceFee}
                    onChange={(e) => setCalcForm(p => ({ ...p, commonMaintenanceFee: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">장기수선충당금 (원)</Label>
                  <Input
                    type="number"
                    value={calcForm.specialFund}
                    onChange={(e) => setCalcForm(p => ({ ...p, specialFund: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">공과금 합계 (원)</Label>
                  <Input
                    type="number"
                    value={calcForm.utilityTotal}
                    onChange={(e) => setCalcForm(p => ({ ...p, utilityTotal: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">특별부과금 (원)</Label>
                  <Input
                    type="number"
                    value={calcForm.specialSurcharge}
                    onChange={(e) => setCalcForm(p => ({ ...p, specialSurcharge: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg border bg-gray-50">
                <Switch
                  checked={calcForm.splitHighCostRepairs}
                  onCheckedChange={(checked) => setCalcForm(p => ({ ...p, splitHighCostRepairs: checked }))}
                />
                <div className="flex-1">
                  <p className="text-sm font-medium">고액 수선비 분할 부과</p>
                  <p className="text-xs text-muted-foreground">장기수선충당금을 월 분할하여 부과</p>
                </div>
                {calcForm.splitHighCostRepairs && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={calcForm.amortizationMonths}
                      onChange={(e) => setCalcForm(p => ({ ...p, amortizationMonths: e.target.value }))}
                      className="w-20 text-center"
                    />
                    <span className="text-xs text-muted-foreground">개월</span>
                  </div>
                )}
              </div>

              <Button
                className="w-full"
                onClick={handleCalculate}
                disabled={calcMutation.isPending || !requiredDone}
              >
                <Calculator className="w-4 h-4 mr-2" />
                {calcMutation.isPending ? "산출 중..." : "관리비 산출 실행"}
              </Button>
            </CardContent>
          </Card>

          {calcResult && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">산출 결과 ({calcResult.month})</CardTitle>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{calcResult.totalUnits}세대</p>
                      <p className="text-lg font-bold text-primary">{formatKrw(calcResult.grandTotal)}원</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b text-muted-foreground">
                          <th className="p-2 text-left">호실</th>
                          <th className="p-2 text-right">면적</th>
                          <th className="p-2 text-right">비율</th>
                          <th className="p-2 text-right">공용</th>
                          <th className="p-2 text-right">수선</th>
                          <th className="p-2 text-right">공과금</th>
                          {Number(calcForm.specialSurcharge) > 0 && <th className="p-2 text-right">특별</th>}
                          <th className="p-2 text-right font-semibold">합계</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calcResult.items.map((item) => (
                          <tr key={item.unitNumber} className="border-b last:border-0">
                            <td className="p-2 font-medium">{item.unitNumber}호</td>
                            <td className="p-2 text-right">{item.exclusiveArea}㎡</td>
                            <td className="p-2 text-right">{item.areaRatio}%</td>
                            <td className="p-2 text-right">{formatKrw(item.commonFee ?? 0)}</td>
                            <td className="p-2 text-right">{formatKrw(item.specialFund ?? 0)}</td>
                            <td className="p-2 text-right">{formatKrw(item.utilityFee ?? 0)}</td>
                            {Number(calcForm.specialSurcharge) > 0 && (
                              <td className="p-2 text-right">{formatKrw(item.specialSurcharge ?? 0)}</td>
                            )}
                            <td className="p-2 text-right font-semibold">{formatKrw(item.totalFee)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </TabsContent>
      </Tabs>

      <div>
        <h2 className="text-lg font-semibold mb-3">회계 메뉴</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {menuCards.map((item) => (
            <Link key={item.path} href={item.path}>
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`p-2.5 rounded-lg ${item.color} shrink-0`}>
                    <item.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{item.label}</p>
                      {item.badge && (
                        <Badge variant={item.badgeVariant || "secondary"} className="text-[10px]">
                          {item.badge}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              미완료 결재 확인
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">
              해당월에 완료되지 않은 결재가 있어 관리비를 산출할 수 없습니다.
              결재를 먼저 완료해주세요.
            </p>
            {approvalCheck && (
              <div className="space-y-1 text-xs">
                {approvalCheck.pending > 0 && (
                  <p className="text-amber-700">미결재 {approvalCheck.pending}건</p>
                )}
                {approvalCheck.rejected > 0 && (
                  <p className="text-red-600">반려 {approvalCheck.rejected}건</p>
                )}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Link href="/approvals" className="flex-1">
                <Button className="w-full">
                  결재함으로 이동 <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
              <Button variant="outline" onClick={() => setApprovalDialogOpen(false)}>
                닫기
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
