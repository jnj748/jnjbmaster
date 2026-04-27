// [Task #475] RFQ 다이얼로그의 "건물 정보가 비어 있음" 경고 박스 노출 여부를
//   결정하는 작은 순수 함수. UI 와 동일한 분기를 한 곳에서 단언/테스트한다.
//   - buildingReady=true  → 정상 폼만 노출, 경고 숨김.
//   - buildingReady=false → 노란 경고 + "건물 정보 설정으로 이동" CTA 노출.
import { deriveSidoSigungu } from "@workspace/shared/derive-region";

export interface BuildingForRfq {
  name?: string | null;
  sido?: string | null;
  sigungu?: string | null;
  addressFull?: string | null;
  addressJibun?: string | null;
}

export interface BuildingReadyResult {
  buildingName: string;
  buildingSido: string;
  buildingSigungu: string;
  buildingReady: boolean;
}

export function computeBuildingReady(
  building: BuildingForRfq | null | undefined,
): BuildingReadyResult {
  const buildingName = building?.name || "";
  const ctxSido = building?.sido || "";
  const ctxSigungu = building?.sigungu || "";
  const derived = !ctxSido || !ctxSigungu
    ? deriveSidoSigungu(building?.addressFull ?? null, building?.addressJibun ?? null)
    : { sido: null, sigungu: null };
  const buildingSido = ctxSido || derived.sido || "";
  const buildingSigungu = ctxSigungu || derived.sigungu || "";
  const buildingReady = !!buildingName && (!!buildingSido || !!buildingSigungu);
  return { buildingName, buildingSido, buildingSigungu, buildingReady };
}
