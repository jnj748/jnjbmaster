import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { AlertTriangle, Info, Shield, ScrollText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

export const PLATFORM_OPERATOR = {
  legalName: "(주)관리의달인",
  representativeName: "홍길동",
  businessRegNumber: "123-45-67890",
  mailOrderRegNumber: "제2025-서울강남-00000호",
  address: "서울특별시 강남구 테헤란로 123, 4층",
  phone: "1588-0000",
  email: "support@manager-master.kr",
  intermediaryStatement:
    "(주)관리의달인은 「전자상거래 등에서의 소비자보호에 관한 법률」에 따른 통신판매중개자이며, 통신판매의 당사자가 아닙니다. 개별 용역계약의 이행·의무·하자에 관한 책임은 관리단(건물)과 파트너사(용역사)에게 있으며, 플랫폼 운영사는 거래의 당사자로서의 책임을 지지 않습니다.",
};

const CONSENT_VERSION = "1.0";

type ConsentType =
  | "intermediary_terms"
  | "privacy_policy"
  | "partner_terms"
  | "contract_disclaimer"
  | "inspection_completion_disclaimer";

function apiBase() {
  const BASE = import.meta.env.BASE_URL ?? "/";
  return `${BASE}api`;
}

export async function recordConsent(
  token: string,
  consentType: ConsentType,
  contextRef?: string,
  options?: { throwOnError?: boolean },
) {
  try {
    const res = await fetch(`${apiBase()}/platform/consents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        consentType,
        version: CONSENT_VERSION,
        contextRef: contextRef ?? null,
      }),
    });
    if (!res.ok) {
      if (options?.throwOnError) {
        const err = new Error(`동의 기록 실패 (${res.status})`) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
    }
  } catch (e) {
    if (options?.throwOnError) throw e;
  }
}

export async function checkConsent(token: string, consentType: ConsentType): Promise<boolean> {
  try {
    const res = await fetch(
      `${apiBase()}/platform/consents/check?consentType=${encodeURIComponent(consentType)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return false;
    const data = await res.json();
    return !!data?.consented;
  } catch {
    return false;
  }
}

export function IntermediaryDisclaimerBanner({
  variant = "default",
  className = "",
}: {
  variant?: "default" | "contract" | "compact";
  className?: string;
}) {
  const text =
    variant === "contract"
      ? "본 계약은 관리단(건물)과 파트너사(용역사) 간의 직접 계약입니다. 플랫폼 운영사는 통신판매중개자로서 계약 당사자가 아니며, 계약의 이행·의무·하자에 대한 책임을 지지 않습니다."
      : variant === "compact"
        ? "플랫폼 운영사는 통신판매중개자이며 거래 당사자가 아닙니다."
        : "(주)관리의달인은 통신판매중개자로서 견적·계약·이행 과정의 정보 제공 및 중개 도구를 제공합니다. 거래의 당사자는 관리단과 파트너사이며, 거래 결과에 대한 책임은 당사자 간에 귀속됩니다.";

  return (
    <div
      className={`flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 ${className}`}
    >
      <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <p>{text}</p>
    </div>
  );
}

export function InformationOnlyNotice({
  className = "",
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`flex items-start gap-1.5 text-[11px] text-muted-foreground ${className}`}>
      <Info className="w-3 h-3 shrink-0 mt-0.5" />
      <span>
        {children ??
          "본 알림은 법적 권고 기한 안내를 위한 정보 제공 서비스이며, 실제 이행·보증을 담보하지 않습니다."}
      </span>
    </div>
  );
}

export function PlatformFooter() {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  return (
    <>
      <footer className="border-t bg-muted/30 px-4 py-3 text-[11px] text-muted-foreground space-y-1">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <span className="font-semibold text-foreground">{PLATFORM_OPERATOR.legalName}</span>
          <span>대표자: {PLATFORM_OPERATOR.representativeName}</span>
          <span>사업자등록번호: {PLATFORM_OPERATOR.businessRegNumber}</span>
          <span>통신판매업: {PLATFORM_OPERATOR.mailOrderRegNumber}</span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <span>{PLATFORM_OPERATOR.address}</span>
          <span>고객센터: {PLATFORM_OPERATOR.phone}</span>
          <span>{PLATFORM_OPERATOR.email}</span>
        </div>
        <div className="pt-1">
          <span className="inline-flex items-center gap-1 text-amber-700">
            <Shield className="w-3 h-3" />
            (주)관리의달인은 통신판매중개자이며, 통신판매의 당사자가 아닙니다.
          </span>
        </div>
        <div className="flex flex-wrap gap-3 pt-1">
          <button onClick={() => setAboutOpen(true)} className="underline-offset-2 hover:underline">
            회사소개
          </button>
          <button onClick={() => setTermsOpen(true)} className="underline-offset-2 hover:underline">
            이용약관·개인정보처리방침
          </button>
        </div>
      </footer>
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
      <TermsDialog open={termsOpen} onOpenChange={setTermsOpen} />
    </>
  );
}

export function AboutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>회사소개</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="font-semibold">{PLATFORM_OPERATOR.legalName}</p>
          <ul className="space-y-1 text-muted-foreground">
            <li>대표자: {PLATFORM_OPERATOR.representativeName}</li>
            <li>사업자등록번호: {PLATFORM_OPERATOR.businessRegNumber}</li>
            <li>통신판매업 신고번호: {PLATFORM_OPERATOR.mailOrderRegNumber}</li>
            <li>주소: {PLATFORM_OPERATOR.address}</li>
            <li>고객센터: {PLATFORM_OPERATOR.phone}</li>
            <li>이메일: {PLATFORM_OPERATOR.email}</li>
          </ul>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            {PLATFORM_OPERATOR.intermediaryStatement}
          </div>
          <p className="text-xs text-muted-foreground">
            관리의달인은 집합건물 관리단과 용역사(파트너사)를 연결하는 행정 도구를 제공하며,
            견적·계약·이행·하자 등 개별 거래의 당사자가 아닙니다.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const TERMS_BODY = `[이용약관 요지]

제1조 (목적)
본 약관은 (주)관리의달인(이하 "회사")이 제공하는 집합건물 관리행정 및 견적·계약 중개 서비스(이하 "서비스")의 이용 조건을 정합니다.

제2조 (회사의 지위)
1. 회사는 「전자상거래 등에서의 소비자보호에 관한 법률」 상의 통신판매중개자이며, 통신판매의 당사자가 아닙니다.
2. 회사는 관리단(건물)과 파트너사(용역사) 간의 견적·계약·이행을 위한 도구·정보·중개 환경을 제공합니다.
3. 회사는 개별 용역계약의 이행·의무·하자·분쟁에 대한 당사자로서의 책임을 지지 않으며, 책임은 관리단과 파트너사에게 귀속됩니다.

제3조 (서비스의 성격)
1. 하자담보, 법정점검, 계약 만료 등 회사가 제공하는 모든 알림은 정보 제공 서비스이며, 실제 이행·보증을 담보하지 않습니다.
2. 회사가 제공하는 검수·결재·계약서 양식 등은 행정 도구로서 제공되며, 법적 효력은 당사자의 서명·합의에 의합니다.

제4조 (이용자의 의무)
1. 이용자는 약관과 관계 법령을 준수하여야 합니다.
2. 견적·계약 정보의 진실성·정확성에 관한 책임은 해당 정보를 제공한 당사자에게 있습니다.

[개인정보처리방침 요지]

1. 수집 항목: 이메일, 이름, 전화번호, 소속 건물·업체 정보 및 서비스 이용 기록.
2. 수집 목적: 서비스 제공, 본인 확인, 결재·계약 이력 관리, 알림 발송.
3. 보유 기간: 회원 탈퇴 시까지 (관계 법령에 따라 일정 기간 보관 가능).
4. 처리 위탁: 클라우드 인프라 등 필수 위탁 외에는 제3자 제공하지 않습니다.

[파트너 이용약관 요지]

1. 파트너사는 회사가 제공하는 견적 요청에 응할 수 있으며, 계약 체결 및 이행의 당사자는 파트너사와 관리단입니다.
2. 회사는 견적 매칭·정산 도구만 제공하며, 계약 이행 결과에 대한 보증을 하지 않습니다.
3. 파트너사는 정확한 사업자 정보·자격을 등록할 의무가 있으며, 허위 정보 등록 시 이용이 제한될 수 있습니다.
`;

export function TermsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="w-4 h-4" />
            이용약관 · 개인정보처리방침 · 파트너 이용약관
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-2">
          <pre className="text-xs whitespace-pre-wrap font-sans leading-5 text-foreground">
            {TERMS_BODY}
          </pre>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export function InspectionCompletionConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  contextRef,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: () => void;
  contextRef?: string;
}) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setAgree(false);
  }, [open]);

  async function handle() {
    if (!token) {
      toast({ title: "로그인이 필요합니다", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await recordConsent(token, "inspection_completion_disclaimer", contextRef, {
        throwOnError: true,
      });
    } catch {
      setSubmitting(false);
      toast({
        title: "동의 기록에 실패했습니다. 네트워크를 확인하고 다시 시도해 주세요.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(false);
    onOpenChange(false);
    onConfirm();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            검수 완료 확인
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            검수 완료 후 발생하는 하자는 계약서상의 하자담보책임기간에 따라 관리단과 파트너사
            당사자 간에 해결되며, 플랫폼의 중개 역할은 종료됩니다. 플랫폼은 하자에 대한 보증
            책임을 지지 않습니다.
          </div>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
            />
            <span>위 내용을 확인하고 검수 완료 처리에 동의합니다.</span>
          </label>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button className="flex-1" disabled={!agree || submitting} onClick={handle}>
              {submitting ? "처리 중..." : "확인 및 검수 완료"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
