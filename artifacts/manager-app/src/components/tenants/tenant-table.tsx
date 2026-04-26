import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle, Download, Edit, Eye, Loader2, Trash2 } from "lucide-react";
import type { Tenant } from "@workspace/api-client-react";
import { formatPhoneNumber } from "@/lib/format-korean";

interface Props {
  tenants: Tenant[];
  exportingId: number | null;
  getVerificationBadge: (status: string | null | undefined) => React.ReactNode;
  onView: (tenant: Tenant) => void;
  onVerify: (tenant: Tenant) => void;
  onExport: (tenant: Tenant) => void;
  onEdit: (tenant: Tenant) => void;
  onDelete: (id: number) => void;
}

export function TenantTable({
  tenants,
  exportingId,
  getVerificationBadge,
  onView,
  onVerify,
  onExport,
  onEdit,
  onDelete,
}: Props) {
  return (
    <>
      <div className="hidden desktop:block">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>호실</TableHead>
                  <TableHead>입주자명</TableHead>
                  <TableHead>휴대폰</TableHead>
                  <TableHead>입주일</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>확인</TableHead>
                  <TableHead>서류</TableHead>
                  <TableHead className="text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-medium">{tenant.unit}</TableCell>
                    <TableCell>{tenant.tenantName}</TableCell>
                    <TableCell className="text-muted-foreground">{tenant.phone ? formatPhoneNumber(tenant.phone) : "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{tenant.moveInDate || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={tenant.status === "active" ? "default" : tenant.status === "destroyed" ? "destructive" : "secondary"}>
                        {tenant.status === "active" ? "입주중" : tenant.status === "destroyed" ? "파기완료" : "퇴거"}
                      </Badge>
                    </TableCell>
                    <TableCell>{getVerificationBadge(tenant.verificationStatus)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {tenant.contractDoc && <Badge variant="outline" className="text-xs">계약서</Badge>}
                        {tenant.businessRegDoc && <Badge variant="outline" className="text-xs">사업자</Badge>}
                        {tenant.idDoc && <Badge variant="outline" className="text-xs">신분증</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => onView(tenant)}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        {tenant.verificationStatus === "unverified" && tenant.signatureName && (
                          <Button variant="ghost" size="sm" onClick={() => onVerify(tenant)} className="text-orange-600">
                            <CheckCircle className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => onExport(tenant)} disabled={exportingId === tenant.id}>
                          {exportingId === tenant.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => onEdit(tenant)}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => onDelete(tenant.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <div className="desktop:hidden space-y-2">
        {tenants.map((tenant) => (
          <Card key={tenant.id} className="cursor-pointer" onClick={() => onView(tenant)}>
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{tenant.unit}호</span>
                    <span className="text-sm">{tenant.tenantName}</span>
                    <Badge variant={tenant.status === "active" ? "default" : tenant.status === "destroyed" ? "destructive" : "secondary"} className="text-[10px]">
                      {tenant.status === "active" ? "입주중" : tenant.status === "destroyed" ? "파기완료" : "퇴거"}
                    </Badge>
                    {getVerificationBadge(tenant.verificationStatus)}
                  </div>
                  {tenant.phone && <p className="text-xs text-muted-foreground mt-1">{formatPhoneNumber(tenant.phone)}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-11 w-11" onClick={(e) => { e.stopPropagation(); onEdit(tenant); }}>
                    <Edit className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-11 w-11" onClick={(e) => { e.stopPropagation(); onDelete(tenant.id); }}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
