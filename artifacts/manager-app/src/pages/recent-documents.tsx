import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import RecentDocumentsWidget from "@/components/dashboard-widgets/widgets/recent-documents-widget";
import { useBuilding } from "@/contexts/building-context";

export default function RecentDocumentsPage() {
  const { building } = useBuilding();

  return (
    <div className="container mx-auto p-3 sm:p-4 max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/">
          <Button variant="ghost" size="sm" data-testid="btn-back">
            <ArrowLeft className="w-4 h-4 mr-1" />
            대시보드
          </Button>
        </Link>
        <h1 className="text-lg font-bold">최근 문서함</h1>
      </div>
      <RecentDocumentsWidget buildingId={building?.id ?? null} />
    </div>
  );
}
