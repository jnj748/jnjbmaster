import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

interface ResponsiveDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function ResponsiveDialog({ open, onOpenChange, children }: ResponsiveDialogProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <Drawer open={open} onOpenChange={onOpenChange}>{children}</Drawer>;
  }
  return <Dialog open={open} onOpenChange={onOpenChange}>{children}</Dialog>;
}

interface TriggerProps {
  asChild?: boolean;
  children: React.ReactNode;
}

function ResponsiveDialogTrigger({ children, asChild, ...rest }: TriggerProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const isMobile = useIsMobile();
  if (isMobile) return <DrawerTrigger asChild={asChild} {...rest}>{children}</DrawerTrigger>;
  return <DialogTrigger asChild={asChild} {...rest}>{children}</DialogTrigger>;
}

interface ContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  // Radix Dialog primitive props — desktop 분기에서 forward, mobile(Drawer) 에서는 무시.
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onPointerDownOutside?: (event: Event) => void;
  onInteractOutside?: (event: Event) => void;
}

// 모바일 가상 키보드(iOS Safari, Android Chrome) 가 올라오면 visual viewport 의 높이가 줄고,
// 100vh / 90vh 기반의 Drawer 는 화면 밖으로 잘려 저장/취소 버튼이 보이지 않게 된다.
// `window.visualViewport` 를 구독해 현재 보이는 영역의 높이를 inline style 로 적용한다.
// 키보드가 닫히면 다시 원래 높이로 늘어난다.
function useVisualViewportHeight(enabled: boolean) {
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    const compute = () => {
      const h = vv?.height ?? window.innerHeight;
      setHeight(h);
    };
    compute();
    if (vv) {
      vv.addEventListener("resize", compute);
      vv.addEventListener("scroll", compute);
    }
    window.addEventListener("resize", compute);
    return () => {
      if (vv) {
        vv.removeEventListener("resize", compute);
        vv.removeEventListener("scroll", compute);
      }
      window.removeEventListener("resize", compute);
    };
  }, [enabled]);
  return height;
}

function ResponsiveDialogContent({
  children,
  className,
  onEscapeKeyDown,
  onPointerDownOutside,
  onInteractOutside,
  style,
  ...rest
}: ContentProps) {
  const isMobile = useIsMobile();
  const vvHeight = useVisualViewportHeight(isMobile);
  if (isMobile) {
    // 키보드가 올라와도 Drawer 가 visual viewport 안에 들어맞도록 maxHeight 를 동적으로 잡는다.
    // 약간(8px)의 여유를 둬 하단 인디케이터/홈바와 겹치지 않게 한다.
    const maxH = vvHeight ? Math.max(160, Math.floor(vvHeight - 8)) : null;
    const mergedStyle: React.CSSProperties = {
      ...style,
      ...(maxH ? { maxHeight: `${maxH}px` } : {}),
    };
    return (
      <DrawerContent
        className={cn("max-h-[90dvh]", className)}
        style={mergedStyle}
        {...rest}
      >
        {/* flex-1 + min-h-0 으로 내부 스크롤 영역이 남은 공간을 모두 차지하면서, */}
        {/* 부모(DrawerContent) 의 maxHeight 안에서만 자란다. 푸터/액션 버튼은 항상 보인다. */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 pb-4">
          {children}
        </div>
      </DrawerContent>
    );
  }
  return (
    <DialogContent
      className={className}
      style={style}
      onEscapeKeyDown={onEscapeKeyDown}
      onPointerDownOutside={onPointerDownOutside}
      onInteractOutside={onInteractOutside}
      {...rest}
    >
      {children}
    </DialogContent>
  );
}

function ResponsiveDialogHeader({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const isMobile = useIsMobile();
  if (isMobile) return <DrawerHeader className={className} {...props}>{children}</DrawerHeader>;
  return <DialogHeader className={className} {...props}>{children}</DialogHeader>;
}

interface TitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode;
}

function ResponsiveDialogTitle({ children, className, ...rest }: TitleProps) {
  const isMobile = useIsMobile();
  if (isMobile) return <DrawerTitle className={className}>{children}</DrawerTitle>;
  return <DialogTitle className={className}>{children}</DialogTitle>;
}

function ResponsiveDialogDescription({ children, className }: { children: React.ReactNode; className?: string }) {
  const isMobile = useIsMobile();
  if (isMobile) return <DrawerDescription className={className}>{children}</DrawerDescription>;
  return <DialogDescription className={className}>{children}</DialogDescription>;
}

function ResponsiveDialogFooter({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const isMobile = useIsMobile();
  if (isMobile) return <DrawerFooter className={className} {...props}>{children}</DrawerFooter>;
  return <DialogFooter className={className} {...props}>{children}</DialogFooter>;
}

interface CloseProps {
  asChild?: boolean;
  children?: React.ReactNode;
}

function ResponsiveDialogClose({ children, asChild }: CloseProps) {
  const isMobile = useIsMobile();
  if (isMobile) return <DrawerClose asChild={asChild}>{children}</DrawerClose>;
  return <DialogClose asChild={asChild}>{children}</DialogClose>;
}

export {
  ResponsiveDialog,
  ResponsiveDialogTrigger,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogClose,
};
