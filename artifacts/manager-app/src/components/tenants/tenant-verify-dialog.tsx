import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Tenant } from "@workspace/api-client-react";

interface Props {
  tenant: Tenant | null;
  rejectionReason: string;
  setRejectionReason: (v: string) => void;
  onClose: () => void;
  onReject: (id: number) => void;
}

export function TenantVerifyDialog({ tenant, rejectionReason, setRejectionReason, onClose, onReject }: Props) {
  return (
    <ResponsiveDialog open={!!tenant} onOpenChange={(o) => { if (!o) onClose(); }}>
      <ResponsiveDialogContent className="max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>입주자카드 반려</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        {tenant && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {tenant.unit}호 {tenant.tenantName} 입주자카드를 반려합니다.
              사유를 입력해 주세요.
            </p>
            <div>
              <Label>반려 사유</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="서류 불일치, 정보 오류 등"
              />
            </div>
            <Button variant="destructive" className="w-full" onClick={() => onReject(tenant.id)}>
              반려 처리
            </Button>
          </div>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
