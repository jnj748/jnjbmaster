import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Car, Plus, Trash2 } from "lucide-react";
import { Section } from "@/components/tenant-card-form/section";
import { Field } from "@/components/tenant-card-form/field";
import type { FormData, VehicleEntry } from "@/components/tenant-card-form/types";

interface Props {
  form: FormData;
  addVehicle: () => void;
  removeVehicle: (idx: number) => void;
  updateVehicle: (idx: number, patch: Partial<VehicleEntry>) => void;
}

export function VehicleSection({ form, addVehicle, removeVehicle, updateVehicle }: Props) {
  return (
    <Section icon={<Car className="w-4 h-4" />} title="차량등록">
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          차량이 있으시면 등록해 주세요. 미등록 차량은 주차 서비스 이용이 제한될 수 있습니다.
        </p>
        {form.vehicles.map((v, idx) => (
          <div key={idx} className="border rounded-lg p-3 space-y-2 relative">
            <div className="flex justify-between items-center mb-1">
              <Badge variant={v.isPrimary ? "default" : "outline"} className="text-xs">
                {v.isPrimary ? "기본차량" : "추가차량"}
              </Badge>
              <Button type="button" variant="ghost" size="sm" className="h-11 w-11 p-0" onClick={() => removeVehicle(idx)}>
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
            <Field label="차량번호 *" required>
              <Input value={v.vehicleNumber} onChange={(e) => updateVehicle(idx, { vehicleNumber: e.target.value })} placeholder="12가 3456" required />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="차종">
                <Input value={v.vehicleType} onChange={(e) => updateVehicle(idx, { vehicleType: e.target.value })} placeholder="소나타" />
              </Field>
              <Field label="색상">
                <Input value={v.vehicleColor} onChange={(e) => updateVehicle(idx, { vehicleColor: e.target.value })} placeholder="흰색" />
              </Field>
            </div>
            <Field label="입주자와의 관계 *" required>
              <Input value={v.tenantRelation} onChange={(e) => updateVehicle(idx, { tenantRelation: e.target.value })} placeholder="본인, 배우자, 자녀 등" required />
            </Field>
            <Field label="운전자 연락처 *" required>
              <Input type="tel" inputMode="tel" value={v.ownerContact} onChange={(e) => updateVehicle(idx, { ownerContact: e.target.value })} placeholder="010-0000-0000" required />
            </Field>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={addVehicle}>
          <Plus className="w-4 h-4 mr-1" />
          차량 추가
        </Button>
      </div>
    </Section>
  );
}
