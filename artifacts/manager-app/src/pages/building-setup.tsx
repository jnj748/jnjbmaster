import { useEffect } from "react";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Building, Calendar, DownloadCloud, Image as ImageIcon, MapPin } from "lucide-react";
import { StepAddress } from "@/components/building-setup/step-address";
import { StepInfo } from "@/components/building-setup/step-info";
import { StepLogo } from "@/components/building-setup/step-logo";
import { StepTasks } from "@/components/building-setup/step-tasks";
import { StepUnitsImport } from "@/components/building-setup/step-units-import";
import { WarrantySection } from "@/components/building-setup/warranty-section";
import { useBuildingSetup } from "@/components/building-setup/use-building-setup";

declare global {
  interface Window {
    daum: {
      Postcode: new (config: {
        oncomplete: (data: {
          roadAddress: string;
          jibunAddress: string;
          zonecode: string;
          sido: string;
          sigungu: string;
          bname: string;
          buildingName: string;
          bcode: string;
          jibunAddressEnglish: string;
          address: string;
        }) => void;
        width?: string;
        height?: string;
      }) => { open: () => void };
    };
  }
}

export default function BuildingSetup() {
  const setup = useBuildingSetup();
  const [location] = useLocation();

  // [Task #348] 대시보드 제안업무 카드 등에서 ?tab=units-import 로 진입하면
  // 호실 일괄 가져오기 단계(인덱스 4)로 자동 이동한다. 5번째 핀(파일은 항상 렌더)
  // 의 인덱스가 4이므로 existingId 로딩 여부와 무관하게 즉시 점프한다.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (setup.loading) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "units-import") {
      setup.setActiveStep(4);
    }
  }, [location, setup.loading, setup.setActiveStep]);

  if (setup.loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  // [Task #348] "호실 일괄 가져오기" 5번째 단계는 항상 노출한다. 건물 저장 전이면
  // 단계 본문이 안내 메시지를 띄우므로 별도 가드는 불필요.
  const steps = [
    { label: "주소 검색", icon: MapPin },
    { label: "건물 정보 입력", icon: Building },
    { label: "로고 등록", icon: ImageIcon },
    { label: "법정업무 선택", icon: Calendar },
    { label: "호실 일괄 가져오기", icon: DownloadCloud },
  ];

  return (
    <div className="space-y-6 pb-[max(env(safe-area-inset-bottom),8rem)] [scroll-padding-bottom:8rem]">
      <div>
        <h1 className="text-2xl font-bold">건물 관리정보 설정</h1>
        <p className="text-muted-foreground text-sm mt-1">
          건축물대장 조회로 건물 정보를 자동으로 불러오고, 법정점검 일정을 설정합니다
        </p>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {steps.map((step, i) => (
          <button
            key={i}
            onClick={() => setup.setActiveStep(i)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              setup.activeStep === i
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <step.icon className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">{step.label}</span>
          </button>
        ))}
      </div>

      {setup.activeStep === 0 && (
        <StepAddress
          building={setup.building}
          postcodeLoaded={setup.postcodeLoaded}
          lookingUp={setup.lookingUp}
          registerPreview={setup.registerPreview}
          areaInfo={setup.areaInfo}
          openKakaoPostcode={setup.openKakaoPostcode}
          postcodeOpen={setup.postcodeOpen}
          setPostcodeOpen={setup.setPostcodeOpen}
          postcodeContainerRef={setup.postcodeContainerRef}
          setActiveStep={setup.setActiveStep}
        />
      )}

      {setup.activeStep === 1 && (
        <StepInfo
          building={setup.building}
          setBuilding={setup.setBuilding}
          handleFieldChange={setup.handleFieldChange}
          safetyResult={setup.safetyResult}
          calculatingSafety={setup.calculatingSafety}
          calculateSafety={setup.calculateSafety}
          selectedTasks={setup.selectedTasks}
          saving={setup.saving}
          existingId={setup.existingId}
          saveBuilding={setup.saveBuilding}
        />
      )}

      {setup.activeStep === 2 && (
        <StepLogo
          building={setup.building}
          setBuilding={setup.setBuilding}
          saving={setup.saving}
          existingId={setup.existingId}
          saveBuilding={setup.saveBuilding}
          setActiveStep={setup.setActiveStep}
          nextStepIndex={3}
        />
      )}

      {setup.activeStep === 3 && (
        <>
          <StepTasks
            searchRef={setup.searchRef}
            taskSearch={setup.taskSearch}
            setTaskSearch={setup.setTaskSearch}
            showSuggestions={setup.showSuggestions}
            setShowSuggestions={setup.setShowSuggestions}
            filteredSuggestions={setup.filteredSuggestions}
            addPresetTask={setup.addPresetTask}
            customTaskName={setup.customTaskName}
            setCustomTaskName={setup.setCustomTaskName}
            customTaskCategory={setup.customTaskCategory}
            setCustomTaskCategory={setup.setCustomTaskCategory}
            customTaskCycle={setup.customTaskCycle}
            setCustomTaskCycle={setup.setCustomTaskCycle}
            addCustomTask={setup.addCustomTask}
            selectedTasks={setup.selectedTasks}
            safetyResult={setup.safetyResult}
            updateTaskDate={setup.updateTaskDate}
            removeTask={setup.removeTask}
            inspectionsScheduled={setup.inspectionsScheduled}
            scheduleInspections={setup.scheduleInspections}
            schedulingInspections={setup.schedulingInspections}
            existingId={setup.existingId}
            useApprovalDateFallback={setup.useApprovalDateFallback}
            setUseApprovalDateFallback={setup.setUseApprovalDateFallback}
          />
          {setup.existingId && setup.building.approvalDate && (
            <WarrantySection
              buildingId={setup.existingId}
              approvalDate={setup.building.approvalDate}
              token={setup.token}
            />
          )}
        </>
      )}

      {setup.activeStep === 4 && (
        <StepUnitsImport
          existingId={setup.existingId}
          hasRegisterPk={Boolean(setup.building.buildingRegisterPk)}
        />
      )}
    </div>
  );
}
