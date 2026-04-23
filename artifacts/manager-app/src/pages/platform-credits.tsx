import { VendorCreditsPanel } from "@/pages/admin-dashboard";

// [Task #267] 플랫폼관리자 데이터 관리 그룹의 "파트너 크레딧" 단독 진입 페이지.
//   기존 admin-dashboard 의 VendorCreditsPanel 만 떼어 사이드바 링크 대상으로 사용.
export default function PlatformCreditsPage() {
  return (
    <div className="space-y-4" data-testid="page-platform-credits">
      <div>
        <h1 className="text-xl font-bold text-slate-900">파트너 크레딧</h1>
        <p className="text-sm text-slate-500 mt-1">
          파트너사별 잔액·포인트를 조회하고 수동으로 충전·차감합니다.
        </p>
      </div>
      <VendorCreditsPanel />
    </div>
  );
}
