import { BuildingInfoCard } from "@/components/building-info-card";

/**
 * 건물 정보 위젯 — 현재 컨텍스트의 건물 기본 정보를 보여준다.
 * 건물 단위 업무를 보는 모든 역할(관리소장 / 경리·행정 / 시설기사)이
 * 동일한 컴포넌트를 사용한다.
 */
export default function BuildingInfoWidget() {
  return <BuildingInfoCard />;
}
