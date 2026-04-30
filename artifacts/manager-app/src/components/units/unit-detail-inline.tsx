// [Task #675] 호실 상세 — 인라인(아코디언) 표시용.
// 기존 UnitDetailDialog 가 모달로 보여 주던 핵심 정보(상태/용도/면적/출처/입주자/소유자/차량)를
// 동일한 수준으로 행 바로 아래에 펼쳐 보여 준다. 같은 행을 다시 누르면 닫히고,
// 동시에 한 행만 펼쳐지는 단일 선택 모델을 호출 측에서 관리한다.

import { useState } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, UserCheck, Car, FileText, ClipboardList, ImageIcon } from "lucide-react";
import {
  useGetUnit,
  useGetUnitWorkLogEntries,
  type GetUnit200,
  type GetUnitWorkLogEntries200,
  type UnitLinkedWorkLogEntry,
} from "@workspace/api-client-react";

const STATUS_MAP: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  vacant: { label: "공실", variant: "secondary" },
  occupied: { label: "입주", variant: "default" },
  maintenance: { label: "정비중", variant: "destructive" },
};

const SOURCE_MAP: Record<string, { label: string; cls: string }> = {
  register: { label: "대장 출처", cls: "bg-emerald-100 text-emerald-700" },
  manual: { label: "직접 입력", cls: "bg-slate-100 text-slate-600" },
  csv: { label: "CSV 가져오기", cls: "bg-sky-100 text-sky-700" },
};

interface Props {
  unitId: number;
}

export function UnitDetailInline({ unitId }: Props) {
  const { data, isLoading } = useGetUnit(unitId, {
    query: { enabled: !!unitId, staleTime: 30 * 1000 },
  }) as { data: GetUnit200 | undefined; isLoading: boolean };

  if (isLoading || !data) {
    return (
      <div className="space-y-2 py-2" data-testid={`unit-detail-inline-${unitId}`}>
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const u = data;

  return (
    <div
      className="space-y-4 p-4 bg-muted/40 rounded-md"
      data-testid={`unit-detail-inline-${unitId}`}
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <span className="text-muted-foreground">호실번호:</span>{" "}
          <span className="font-medium">{u.unitNumber}</span>
        </div>
        <div>
          <span className="text-muted-foreground">층:</span>{" "}
          <span className="font-medium">{u.floor}층</span>
        </div>
        <div>
          <span className="text-muted-foreground">상태:</span>{" "}
          <Badge variant={STATUS_MAP[u.status]?.variant || "secondary"}>
            {STATUS_MAP[u.status]?.label || u.status}
          </Badge>
        </div>
        <div>
          <span className="text-muted-foreground">용도:</span> {u.usage || "-"}
        </div>
        <div>
          <span className="text-muted-foreground">전용면적:</span>{" "}
          {u.exclusiveArea ? `${u.exclusiveArea}m²` : "-"}
        </div>
        <div>
          <span className="text-muted-foreground">공용면적:</span>{" "}
          {u.commonArea ? `${u.commonArea}m²` : "-"}
        </div>
        <div className="col-span-2 flex flex-wrap items-center gap-2 pt-1">
          <FileText className="w-3.5 h-3.5 text-muted-foreground" />
          <Badge className={SOURCE_MAP[u.source]?.cls || SOURCE_MAP.manual.cls}>
            {SOURCE_MAP[u.source]?.label || u.source}
          </Badge>
          {u.lastRegisterSyncedAt && (
            <span className="text-xs text-muted-foreground">
              마지막 동기화{" "}
              {new Date(u.lastRegisterSyncedAt).toLocaleString("ko-KR")}
            </span>
          )}
        </div>
        {u.notes && (
          <div className="col-span-2">
            <span className="text-muted-foreground">비고:</span> {u.notes}
          </div>
        )}
      </div>

      <div className="border-t pt-3">
        <div className="flex items-center gap-2 mb-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-medium">입주자</p>
        </div>
        {u.tenants && u.tenants.length > 0 ? (
          <div className="space-y-2">
            {u.tenants.map((t, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm bg-background rounded p-2 border"
              >
                <span>{t.tenantName}</span>
                <span className="text-muted-foreground">{t.phone || "-"}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            해당 호실에 등록된 입주자가 없습니다
          </p>
        )}
      </div>

      <div className="border-t pt-3">
        <div className="flex items-center gap-2 mb-2">
          <UserCheck className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-medium">소유자</p>
        </div>
        {u.owners && u.owners.length > 0 ? (
          <div className="space-y-2">
            {u.owners.map((o, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm bg-background rounded p-2 border"
              >
                <span>{o.ownerName}</span>
                <span className="text-muted-foreground">{o.phone || "-"}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            해당 호실에 등록된 소유자가 없습니다
          </p>
        )}
      </div>

      <div className="border-t pt-3">
        <div className="flex items-center gap-2 mb-2">
          <Car className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-medium">등록 차량</p>
        </div>
        {u.vehicles && u.vehicles.length > 0 ? (
          <div className="space-y-2">
            {u.vehicles.map((v, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm bg-background rounded p-2 border"
              >
                <span className="font-medium">{v.vehicleNumber}</span>
                <span className="text-muted-foreground">
                  {v.vehicleType || ""}{" "}
                  {v.ownerName ? `(${v.ownerName})` : ""}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            해당 호실에 등록된 차량이 없습니다
          </p>
        )}
      </div>

      {/* [Task #708] 호실에 자동/수동으로 연결된 업무기록. */}
      <UnitWorkLogSection unitId={unitId} />
    </div>
  );
}

// ---------------- [Task #708] 관련 업무기록 섹션 ----------------

/** 카테고리 라벨 — work-log 페이지의 CATEGORY_LABEL 과 동일한 표기. */
const CATEGORY_LABEL: Record<string, string> = {
  facility: "시설",
  bill: "고지/수납",
  complaint: "민원",
  admin: "행정",
  receivable: "수납·연체",
  expense: "지출",
  draft: "결재·기안",
  fire: "소방",
  electric: "전기",
  mechanical: "기계설비",
  other: "기타",
};

const PAGE_SIZE = 10;

function UnitWorkLogSection({ unitId }: { unitId: number }) {
  // [Task #708] 누적 페이지네이션 — "더보기" 클릭마다 한 페이지씩 이어 받는다.
  const [pages, setPages] = useState(1);
  const limit = pages * PAGE_SIZE;
  const { data, isLoading } = useGetUnitWorkLogEntries(
    unitId,
    { limit, offset: 0 },
    { query: { enabled: !!unitId, staleTime: 30 * 1000 } },
  ) as { data: GetUnitWorkLogEntries200 | undefined; isLoading: boolean };

  return (
    <div className="border-t pt-3" data-testid={`unit-related-worklog-${unitId}`}>
      <div className="flex items-center gap-2 mb-2">
        <ClipboardList className="w-4 h-4 text-muted-foreground" />
        <p className="text-sm font-medium">관련 업무기록</p>
        {data && data.total > 0 && (
          <span className="text-xs text-muted-foreground">
            전체 {data.total}건
          </span>
        )}
      </div>
      {isLoading && !data ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : !data || data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          이 호실과 연결된 업무기록이 아직 없습니다
        </p>
      ) : (
        <>
          <ul className="space-y-2" data-testid={`unit-related-worklog-list-${unitId}`}>
            {data.items.map((item) => (
              <UnitWorkLogItem key={item.id} item={item} />
            ))}
          </ul>
          {data.items.length < data.total && (
            <div className="mt-2 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPages((p) => p + 1)}
                data-testid={`unit-related-worklog-more-${unitId}`}
              >
                더보기
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function UnitWorkLogItem({ item }: { item: UnitLinkedWorkLogEntry }) {
  const occurredAt = new Date(item.occurredAt);
  const dateLabel = occurredAt.toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  });
  const timeLabel = occurredAt.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  // [Task #708] 항목 클릭 시 업무일지 페이지의 타임라인 탭으로 이동해 해당
  // entry 로 스크롤한다. activity-tab 의 기존 패턴(`#entry-{id}`)과 동일.
  const href = `/work-log?tab=timeline#entry-${item.id}`;
  return (
    <li data-testid={`unit-related-worklog-item-${item.id}`}>
      <Link
        href={href}
        className="block bg-background border rounded p-2 text-sm hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
        data-testid={`unit-related-worklog-link-${item.id}`}
      >
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="secondary" className="text-[10px]">
            {CATEGORY_LABEL[item.category] ?? item.category}
          </Badge>
          <Badge
            className={
              item.matchSource === "manual"
                ? "bg-sky-100 text-sky-700 text-[10px]"
                : "bg-emerald-100 text-emerald-700 text-[10px]"
            }
          >
            {item.matchSource === "manual" ? "수동" : "자동"}
          </Badge>
          <span className="text-xs text-muted-foreground ml-auto">
            {dateLabel} {timeLabel} · {item.authorName}
          </span>
        </div>
        <div className="flex gap-2">
          {item.photoUrl ? (
            <img
              src={item.photoUrl}
              alt="첨부 사진"
              className="w-12 h-12 object-cover rounded border shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded border bg-muted/40 flex items-center justify-center shrink-0">
              <ImageIcon className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
          <p className="text-sm whitespace-pre-wrap break-words flex-1">{item.memo}</p>
        </div>
      </Link>
    </li>
  );
}
