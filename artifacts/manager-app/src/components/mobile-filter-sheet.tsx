import { useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Filter } from "lucide-react";

interface MobileFilterSheetProps {
  children: ReactNode;
  activeCount?: number;
  triggerLabel?: string;
}

export function MobileFilterSheet({ children, activeCount = 0, triggerLabel = "필터" }: MobileFilterSheetProps) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="h-11 desktop:hidden">
          <Filter className="w-4 h-4 mr-2" />
          {triggerLabel}
          {activeCount > 0 && (
            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs w-5 h-5">
              {activeCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-xl max-h-[80vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>필터</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 pt-4 pb-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
