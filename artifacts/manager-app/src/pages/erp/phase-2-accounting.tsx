import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useCalculateFees } from "@workspace/api-client-react";
import {
  Calculator, CheckCircle2, SplitSquareHorizontal,
  Printer, FileSpreadsheet, ClipboardList
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
interface FeeResult {
  unitId?: number;
  unitNumber: string;
  ownerName?: string | null;
  exclusiveArea?: number;
  areaRatio?: number;
  commonFee?: number;
  specialFund?: number;
  utilityFee?: number;
  additionalFee?: number;
  specialSurcharge?: number;
  totalFee: number;
  isPaid?: boolean;
  dueDate?: string;
}
import BillingChecklist from "./components/billing-checklist";

type Tab = "checklist" | "engine";

export default function Phase2AccountingPage() {
  const [activeTab, setActiveTab] = useState<Tab>("checklist");
  const [commonExpenses, setCommonExpenses] = useState("5000000");
  const [repairFund, setRepairFund] = useState("1000000");
  const [splitRepairs, setSplitRepairs] = useState(false);
  const [results, setResults] = useState<FeeResult[] | null>(null);

  const calculateFees = useCalculateFees({
    mutation: {
      onSuccess: (data) => {
        setResults(data.items);
        toast.success("전유면적 비례 배분 계산 완료. 부과총괄표 생성되었습니다.");
      },
      onError: () => {
        toast.error("배분 계산에 실패했습니다.");
      }
    }
  });

  const handleCalculate = () => {
    calculateFees.mutate({
      data: {
        month: new Date().toISOString().slice(0, 7),
        commonMaintenanceFee: Number(commonExpenses),
        specialFund: Number(repairFund),
        splitHighCostRepairs: splitRepairs,
        amortizationMonths: splitRepairs ? 12 : undefined
      }
    });
  };

  const handlePrint = () => {
    toast.success("부과총괄표 PDF 출력 시뮬레이션 완료.");
  };

  const isComplete = results && results.length > 0;
  const totalFee = results ? results.reduce((sum, r) => sum + r.totalFee, 0) : 0;

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "checklist", label: "부과 전야 체크리스트", icon: <ClipboardList className="w-4 h-4" /> },
    { id: "engine", label: "배분 엔진", icon: <Calculator className="w-4 h-4" /> },
  ];

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6"
      >
        {/* Page header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              회계/부과
              {isComplete && <CheckCircle2 className="w-6 h-6 text-primary" />}
            </h2>
            <p className="text-muted-foreground mt-1">
              자료 업로드 체크리스트 · 지출 배분 엔진 · 우발지출 분할부과 · 부과총괄표
            </p>
          </div>
          {isComplete && (
            <Button variant="outline" className="gap-2 border-border/50" onClick={handlePrint}>
              <Printer className="w-4 h-4" /> 부과총괄표 출력
            </Button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-secondary/30 rounded-lg w-fit border border-border/50">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200
                ${activeTab === tab.id
                  ? "bg-card text-foreground shadow-sm border border-border/50"
                  : "text-muted-foreground hover:text-foreground"
                }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "checklist" && <BillingChecklist />}

            {activeTab === "engine" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                  <Card className="bg-card xl:col-span-1 border-border/50 shadow-sm h-fit">
                    <CardHeader className="bg-secondary/20 border-b border-border/50">
                      <CardTitle>지출 입력 항목</CardTitle>
                      <CardDescription>전유면적 비례 배분 기준 금액</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-6">
                      <div className="space-y-3">
                        <Label htmlFor="common" className="text-sm font-semibold text-foreground">공용관리비 합계 (₩)</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">₩</span>
                          <Input
                            id="common"
                            type="number"
                            value={commonExpenses}
                            onChange={(e) => setCommonExpenses(e.target.value)}
                            className="font-mono bg-background pl-8 text-lg"
                          />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <Label htmlFor="repair" className="text-sm font-semibold text-foreground">장기수선충당금 (₩)</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">₩</span>
                          <Input
                            id="repair"
                            type="number"
                            value={repairFund}
                            onChange={(e) => setRepairFund(e.target.value)}
                            className="font-mono bg-background pl-8 text-lg"
                          />
                        </div>
                      </div>

                      <div className="p-4 bg-secondary/20 rounded-lg border border-border/50">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <SplitSquareHorizontal className="w-4 h-4 text-primary" />
                            <Label className="text-sm font-medium">우발지출 분할부과</Label>
                          </div>
                          <Switch checked={splitRepairs} onCheckedChange={setSplitRepairs} />
                        </div>
                        <p className="text-xs text-muted-foreground pl-6">
                          대규모 수선비를 12개월 분할 부과하여 입주민 부담을 경감합니다.
                        </p>
                      </div>

                      <Button
                        onClick={handleCalculate}
                        disabled={calculateFees.isPending}
                        className="w-full h-12 text-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20"
                      >
                        <Calculator className="w-5 h-5 mr-2" />
                        {calculateFees.isPending ? "배분 계산 중..." : "배분 엔진 실행"}
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="bg-card/50 backdrop-blur border-border/50 xl:col-span-2">
                    <CardHeader className="border-b border-border/50 flex flex-row items-center justify-between">
                      <div>
                        <CardTitle>부과총괄표</CardTitle>
                        <CardDescription>전유면적 비례 배분 결과 (세대별 청구 내역)</CardDescription>
                      </div>
                      {isComplete && (
                        <Badge variant="outline" className="font-mono text-primary border-primary/30 bg-primary/5">
                          합계 ₩{totalFee.toLocaleString()}
                        </Badge>
                      )}
                    </CardHeader>
                    <CardContent className="p-0">
                      {!results ? (
                        <div className="py-24 flex flex-col items-center justify-center text-center">
                          <div className="w-16 h-16 rounded-full bg-secondary/30 flex items-center justify-center mb-4 border border-border/50">
                            <Calculator className="w-8 h-8 text-muted-foreground opacity-50" />
                          </div>
                          <h3 className="text-lg font-medium text-foreground">배분 대기 중</h3>
                          <p className="text-sm text-muted-foreground mt-2 max-w-sm">
                            지출 금액을 입력하고 배분 엔진을 실행하면 부과총괄표가 자동 생성됩니다.
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader className="bg-secondary/30">
                              <TableRow className="border-border/50">
                                <TableHead className="font-semibold pl-6">호실</TableHead>
                                <TableHead className="text-right font-semibold">면적 비율</TableHead>
                                <TableHead className="text-right font-semibold">공용관리비</TableHead>
                                <TableHead className="text-right font-semibold">장기수선충당금</TableHead>
                                <TableHead className="text-right font-semibold">공과금</TableHead>
                                <TableHead className="text-right font-bold text-foreground pr-6">세대별 합계</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {results.map((res, i) => (
                                <motion.tr
                                  initial={{ opacity: 0, y: 5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: i * 0.05 }}
                                  key={res.unitId}
                                  className="hover:bg-secondary/20 border-border/50 group"
                                >
                                  <TableCell className="font-mono font-medium pl-6 text-primary/90">{res.unitNumber}호</TableCell>
                                  <TableCell className="text-right text-muted-foreground font-mono text-sm">
                                    <Badge variant="secondary" className="bg-background border-border/50 font-normal">
                                      {(res.areaRatio ?? 0).toFixed(1)}%
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-sm">₩{(res.commonFee ?? 0).toLocaleString()}</TableCell>
                                  <TableCell className="text-right font-mono text-sm">₩{(res.specialFund ?? 0).toLocaleString()}</TableCell>
                                  <TableCell className="text-right font-mono text-sm">₩{(res.utilityFee ?? 0).toLocaleString()}</TableCell>
                                  <TableCell className="text-right font-mono font-bold text-primary pr-6 text-base group-hover:text-primary">
                                    ₩{res.totalFee.toLocaleString()}
                                  </TableCell>
                                </motion.tr>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Source upload reminder */}
                {!results && (
                  <Card className="border-border/50 bg-secondary/10">
                    <CardContent className="py-3 px-5 flex items-center gap-3">
                      <FileSpreadsheet className="w-4 h-4 text-muted-foreground shrink-0" />
                      <p className="text-xs text-muted-foreground">
                        배분 엔진 실행 전, <button onClick={() => setActiveTab("checklist")} className="underline text-primary hover:text-primary/80">체크리스트 탭</button>에서 소스 파일이 모두 업로드되었는지 확인하세요.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </>
  );
}
