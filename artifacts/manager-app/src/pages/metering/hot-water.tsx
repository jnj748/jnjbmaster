// [Task #798] 온수 검침 — 공통 검침 워크스페이스를 미터 종류 고정으로 재사용.
import Phase1MeteringPage from "@/pages/erp/phase-1-metering";

export default function MeteringHotWaterPage() {
  return <Phase1MeteringPage presetMeterType="hot_water" />;
}
