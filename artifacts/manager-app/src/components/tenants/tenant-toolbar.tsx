import { FileText, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TenantToolbarProps {
  unverifiedCount: number;
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  filterStatus: string | undefined;
  setFilterStatus: (v: string | undefined) => void;
}

export function TenantToolbar({
  unverifiedCount,
  searchTerm,
  setSearchTerm,
  filterStatus,
  setFilterStatus,
}: TenantToolbarProps) {
  return (
    <>
      {unverifiedCount > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-orange-600" />
            <span className="text-sm text-orange-800 font-medium">
              서류 확인이 필요한 입주자카드가 {unverifiedCount}건 있습니다
            </span>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="이름, 호실, 전화번호 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterStatus || "all"} onValueChange={(v) => setFilterStatus(v === "all" ? undefined : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="상태" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="active">입주중</SelectItem>
            <SelectItem value="moved_out">퇴거</SelectItem>
            <SelectItem value="destroyed">파기완료</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
