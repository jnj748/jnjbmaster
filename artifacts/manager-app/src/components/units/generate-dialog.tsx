import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from "@/components/ui/responsive-dialog";
import { Layers } from "lucide-react";

export interface GenForm {
  startFloor: string;
  endFloor: string;
  unitsPerFloor: string;
  startUnit: string;
  prefix: string;
  usage: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  genForm: GenForm;
  setGenForm: (form: GenForm) => void;
  isPending: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export function GenerateDialog({ open, onOpenChange, genForm, setGenForm, isPending, onSubmit }: Props) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Layers className="w-4 h-4 mr-1" />
          <span className="hidden desktop:inline">자동 생성</span>
        </Button>
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>호실 자동 생성</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>시작 층</Label>
              <Input type="number" value={genForm.startFloor} onChange={(e) => setGenForm({ ...genForm, startFloor: e.target.value })} required />
            </div>
            <div>
              <Label>끝 층</Label>
              <Input type="number" value={genForm.endFloor} onChange={(e) => setGenForm({ ...genForm, endFloor: e.target.value })} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>층당 호실 수</Label>
              <Input type="number" value={genForm.unitsPerFloor} onChange={(e) => setGenForm({ ...genForm, unitsPerFloor: e.target.value })} required />
            </div>
            <div>
              <Label>시작 호수</Label>
              <Input type="number" value={genForm.startUnit} onChange={(e) => setGenForm({ ...genForm, startUnit: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>접두어 (선택)</Label>
              <Input value={genForm.prefix} onChange={(e) => setGenForm({ ...genForm, prefix: e.target.value })} placeholder="예: A동" />
            </div>
            <div>
              <Label>용도 (선택)</Label>
              <Input value={genForm.usage} onChange={(e) => setGenForm({ ...genForm, usage: e.target.value })} placeholder="예: 사무실" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {genForm.startFloor && genForm.endFloor && genForm.unitsPerFloor
              ? `${(parseInt(genForm.endFloor) - parseInt(genForm.startFloor) + 1) * parseInt(genForm.unitsPerFloor)}개 호실이 생성됩니다`
              : ""}
          </p>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "생성 중..." : "호실 생성"}
          </Button>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
