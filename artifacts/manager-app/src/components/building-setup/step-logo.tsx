import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, ChevronRight, SkipForward, Loader2, Save } from "lucide-react";
import { PhotoUploadField } from "@/components/photo-upload-field";
import { AuthImage } from "@/components/auth-image";
import type { BuildingData } from "./types";

interface Props {
  building: BuildingData;
  setBuilding: React.Dispatch<React.SetStateAction<BuildingData>>;
  saving: boolean;
  existingId: number | null;
  saveBuilding: () => Promise<void> | void;
  setActiveStep: (step: number) => void;
  nextStepIndex: number;
}

export function StepLogo({
  building,
  setBuilding,
  saving,
  existingId,
  saveBuilding,
  setActiveStep,
  nextStepIndex,
}: Props) {
  const buildingName = building.name?.trim() || "OO아파트";
  const hasLogo = !!building.logoUrl;

  function handleSkip() {
    setActiveStep(nextStepIndex);
  }

  async function handleNext() {
    if (existingId) {
      await saveBuilding();
    }
    setActiveStep(nextStepIndex);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            건물 로고 등록
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground leading-relaxed">
            업로드한 로고는 공고문, 점검 안내문, 처리 완료 공지문, 업체 의뢰서 등 모든 인쇄·공유 서류 상단에 자동으로 인쇄됩니다.
            등록하지 않으면 <strong className="text-foreground">건물명이 같은 자리에 글자로 표시</strong>됩니다.
          </p>

          <PhotoUploadField
            label="로고 이미지 (PNG · JPG, 정사각형 또는 가로형 권장)"
            value={building.logoUrl}
            onChange={(url) => setBuilding((prev) => ({ ...prev, logoUrl: url }))}
          />

          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">미리보기 (서류 상단)</p>
            <div className="bg-white rounded border p-4">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b-2 border-black pb-3">
                <div className="flex items-center justify-start min-h-[64px]">
                  {hasLogo ? (
                    <AuthImage
                      src={building.logoUrl as string}
                      alt={`${buildingName} 로고`}
                      className="max-h-16 w-auto object-contain"
                    />
                  ) : (
                    <span
                      className="text-lg font-bold tracking-tight"
                      style={{ whiteSpace: "nowrap" }}
                      data-testid="logo-fallback-text"
                    >
                      {buildingName}
                    </span>
                  )}
                </div>
                <h3 className="text-2xl font-bold tracking-[0.4em] text-center" style={{ whiteSpace: "nowrap" }}>
                  공 고 문
                </h3>
                <div />
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 text-center">
                {hasLogo ? "등록한 로고가 표시됩니다." : "로고 미등록 — 건물명이 자동으로 표시됩니다."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="lg"
          onClick={handleSkip}
          disabled={saving}
          data-testid="btn-logo-skip"
        >
          <SkipForward className="w-4 h-4 mr-2" />
          건너뛰기 (건물명으로 표시)
        </Button>
        <Button
          size="lg"
          onClick={handleNext}
          disabled={saving}
          data-testid="btn-logo-next"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              저장 중...
            </>
          ) : (
            <>
              {existingId ? <Save className="w-4 h-4 mr-2" /> : null}
              다음
              <ChevronRight className="w-4 h-4 ml-1" />
            </>
          )}
        </Button>
      </div>
    </>
  );
}
