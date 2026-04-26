// [Task #469] 호실관리 빈 상태에서 곧바로 호실정보 불러오기 마법사를 모달
// 다이얼로그로 띄우기 위한 진입점. 건물 설정 페이지(StepUnitsImport)의 미리보기/
// 확정 적용 흐름을 그대로 재사용하고, 확정 적용이 성공하면 다이얼로그를 자동
// 으로 닫아 빈 상태가 새 호실 목록으로 즉시 교체되도록 한다.
//
// 사전 조건(건물 미선택/건축물대장 식별자 없음)은 StepUnitsImport 의 기존
// 안내 문구를 그대로 사용해 일관성을 유지하고, 다이얼로그 한정으로
// "건물 설정으로 이동" 보조 버튼을 함께 노출한다.

import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StepUnitsImport } from "@/components/building-setup/step-units-import";
import { useBuilding } from "@/contexts/building-context";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UnitsImportDialog({ open, onOpenChange }: Props) {
  const [, navigate] = useLocation();
  const { building } = useBuilding();
  const goToBuildingSettings = () => {
    onOpenChange(false);
    navigate("/settings/building?tab=units-import");
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-units-import">
        <DialogHeader>
          <DialogTitle>호실정보 불러오기</DialogTitle>
          <DialogDescription>
            건축물대장에 등록된 전유부 정보를 미리보기 후 호실 목록에 한 번에 반영합니다.
          </DialogDescription>
        </DialogHeader>
        <StepUnitsImport
          existingId={building?.id ?? null}
          hasRegisterPk={Boolean(building?.buildingRegisterPk)}
          onApplied={() => onOpenChange(false)}
          onGoToBuildingSettings={goToBuildingSettings}
        />
      </DialogContent>
    </Dialog>
  );
}
