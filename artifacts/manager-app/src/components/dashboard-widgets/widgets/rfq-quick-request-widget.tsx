import { useState, useCallback } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Wrench,
  Flame,
  Zap,
  Cog,
  Fuel,
  Droplets,
  Trash2,
  Sparkles,
  Shield,
  CloudRain,
  Wind,
  Snowflake,
  Building2,
  Search,
  Trees,
  HelpCircle,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PhotoUploadField } from "@/components/photo-upload-field";
import { RFQ_CATEGORY_OPTIONS } from "@/lib/rfq-category-options";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  elevator: Building2,
  fire_safety: Flame,
  electrical: Zap,
  mechanical: Cog,
  gas: Fuel,
  water_tank: Droplets,
  septic: Trash2,
  cleaning: Sparkles,
  security: Shield,
  waterproofing: CloudRain,
  water_leak: Droplets,
  hvac: Snowflake,
  facility_maintenance: Wrench,
  defect_diagnosis: Search,
  building_maintenance: Building2,
  landscaping: Trees,
  other: HelpCircle,
};

export interface RfqQuickRequestPayload {
  category: string;
  description: string;
  closeUpPhotoUrl: string;
  widePhotoUrl: string;
}

interface RfqQuickRequestWidgetProps {
  buildingReady: boolean;
  onSubmit: (payload: RfqQuickRequestPayload) => void;
  isSubmitting?: boolean;
}

type Step = 1 | 2 | 3;

export function RfqQuickRequestWidget({
  buildingReady,
  onSubmit,
  isSubmitting = false,
}: RfqQuickRequestWidgetProps) {
  const [step, setStep] = useState<Step>(1);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [closeUpPhotoUrl, setCloseUpPhotoUrl] = useState<string | null>(null);
  const [widePhotoUrl, setWidePhotoUrl] = useState<string | null>(null);

  const photosReady = !!closeUpPhotoUrl && !!widePhotoUrl;
  const canSubmit = buildingReady && category && description.trim() && photosReady;

  const goNext = useCallback(() => {
    if (step === 1 && category) setStep(2);
    else if (step === 2 && description.trim()) setStep(3);
  }, [step, category, description]);

  const goBack = useCallback(() => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  }, [step]);

  return (
    <div className="space-y-4" data-testid="rfq-quick-request-widget">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span data-testid="rfq-quick-step-indicator">{step} / 3</span>
        {step > 1 && (
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-1 text-brand min-h-[44px]"
            style={{ color: "var(--brand)" }}
            data-testid="rfq-quick-back"
          >
            <ChevronLeft className="w-4 h-4" />
            이전
          </button>
        )}
      </div>

      {!buildingReady && (
        <p className="text-sm text-destructive" data-testid="rfq-building-missing-warning">
          건물 정보를 먼저 등록해 주세요.
        </p>
      )}

      {step === 1 && (
        <div className="space-y-3" data-testid="rfq-quick-step-category">
          <p className="text-[17px] font-semibold" style={{ color: "var(--brand-dark)" }}>
            어떤 분야인가요?
          </p>
          <div className="grid grid-cols-2 gap-2">
            {RFQ_CATEGORY_OPTIONS.map((opt) => {
              const Icon = CATEGORY_ICONS[opt.value] ?? Wrench;
              const selected = category === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCategory(opt.value)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 text-center transition-colors",
                    selected
                      ? "border-[var(--brand)] bg-[var(--brand-light)]"
                      : "border-[var(--brand-border)] bg-white hover:bg-[var(--brand-light)]",
                  )}
                  style={{ minHeight: 56, height: 56 }}
                  data-testid={`rfq-quick-category-${opt.value}`}
                >
                  <Icon className="w-5 h-5 shrink-0" style={{ color: "var(--brand)" }} />
                  <span className="text-xs font-medium leading-tight line-clamp-2">{opt.label}</span>
                </button>
              );
            })}
          </div>
          <Button
            type="button"
            className="manager-phase1-btn w-full"
            disabled={!category}
            onClick={goNext}
            data-testid="rfq-quick-next-1"
          >
            다음
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3" data-testid="rfq-quick-step-description">
          <p className="text-[17px] font-semibold" style={{ color: "var(--brand-dark)" }}>
            어떤 일이 필요한가요?
          </p>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="증상·위치·희망 일정 등을 적어 주세요"
            className="min-h-[140px] text-[17px] rounded-xl border-[var(--brand-border)]"
            data-testid="rfq-quick-description"
          />
          <Button
            type="button"
            className="manager-phase1-btn w-full"
            disabled={!description.trim()}
            onClick={goNext}
            data-testid="rfq-quick-next-2"
          >
            다음
          </Button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3" data-testid="rfq-quick-step-photos">
          <p className="text-[17px] font-semibold" style={{ color: "var(--brand-dark)" }}>
            현장 사진 (근경·원경 필수)
          </p>
          <p className="text-sm text-muted-foreground">
            모바일에서는 촬영·앨범, PC에서는 드래그 또는 파일 선택으로 올릴 수 있습니다.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PhotoUploadField
              label="원경 사진 *"
              value={widePhotoUrl}
              onChange={setWidePhotoUrl}
              testId="rfq-quick-photo-wide"
            />
            <PhotoUploadField
              label="근경 사진 *"
              value={closeUpPhotoUrl}
              onChange={setCloseUpPhotoUrl}
              testId="rfq-quick-photo-close"
            />
          </div>
          <Button
            type="button"
            className="manager-phase1-btn w-full"
            disabled={!canSubmit || isSubmitting}
            onClick={() => {
              if (!canSubmit || !closeUpPhotoUrl || !widePhotoUrl) return;
              onSubmit({
                category,
                description: description.trim(),
                closeUpPhotoUrl,
                widePhotoUrl,
              });
            }}
            data-testid="rfq-quick-submit"
          >
            {isSubmitting ? "요청 중…" : "견적 요청하기"}
          </Button>
        </div>
      )}
    </div>
  );
}
