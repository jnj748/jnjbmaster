// [Task #568] 건축물대장 표제부/총괄표제부 응답 원본을 그룹별로 표시하는 카드.
// 기존 building-info.tsx 안에 인라인으로 있던 정의를 컴포넌트 파일로 분리해
// /building-info 와 /settings/building 두 화면에서 동일하게 재사용한다.
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Info } from "lucide-react";
import { resolveRegisterFields, type RegisterRaw } from "@/lib/building-register-labels";

interface Props {
  registerData: RegisterRaw;
}

export function BuildingRegisterDetailsCard({ registerData }: Props) {
  const groups = resolveRegisterFields(registerData);
  if (groups.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Info className="w-4 h-4 text-indigo-600" />
          건축물대장 상세
        </CardTitle>
        <CardDescription>
          국토교통부 건축물대장 표제부/총괄표제부에서 자동으로 가져온 항목 ·
          빈 값은 자동 숨김 · 화이트리스트에 없는 키는 "기타" 그룹에 원본 키로 노출됩니다
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.title} data-testid={`register-group-${g.title}`}>
              <h4 className="text-sm font-semibold text-muted-foreground mb-2">
                {g.title}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 desktop:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                {g.rows.map((r) => (
                  <div key={r.key} className="flex items-baseline gap-3">
                    <span className="text-muted-foreground whitespace-nowrap min-w-[120px]">
                      {r.label}
                    </span>
                    <span className="font-medium break-all">{r.display}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
