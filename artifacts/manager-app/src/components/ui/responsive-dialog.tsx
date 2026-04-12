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
import { ScrollArea } from "@/components/ui/scroll-area";

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

function ResponsiveDialogTrigger({ children, ...props }: React.ComponentProps<typeof DialogTrigger>) {
  const isMobile = useIsMobile();
  if (isMobile) return <DrawerTrigger {...props}>{children}</DrawerTrigger>;
  return <DialogTrigger {...props}>{children}</DialogTrigger>;
}

function ResponsiveDialogContent({ children, className, ...props }: React.ComponentProps<typeof DialogContent>) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <DrawerContent className={cn("max-h-[85vh]", className)} {...(props as any)}>
        <ScrollArea className="overflow-y-auto px-4 pb-4">
          {children}
        </ScrollArea>
      </DrawerContent>
    );
  }
  return <DialogContent className={className} {...props}>{children}</DialogContent>;
}

function ResponsiveDialogHeader({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const isMobile = useIsMobile();
  if (isMobile) return <DrawerHeader className={className} {...props}>{children}</DrawerHeader>;
  return <DialogHeader className={className} {...props}>{children}</DialogHeader>;
}

function ResponsiveDialogTitle({ children, className, ...props }: React.ComponentProps<typeof DialogTitle>) {
  const isMobile = useIsMobile();
  if (isMobile) return <DrawerTitle className={className} {...(props as any)}>{children}</DrawerTitle>;
  return <DialogTitle className={className} {...props}>{children}</DialogTitle>;
}

function ResponsiveDialogDescription({ children, className, ...props }: React.ComponentProps<typeof DialogDescription>) {
  const isMobile = useIsMobile();
  if (isMobile) return <DrawerDescription className={className} {...(props as any)}>{children}</DrawerDescription>;
  return <DialogDescription className={className} {...props}>{children}</DialogDescription>;
}

function ResponsiveDialogFooter({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const isMobile = useIsMobile();
  if (isMobile) return <DrawerFooter className={className} {...props}>{children}</DrawerFooter>;
  return <DialogFooter className={className} {...props}>{children}</DialogFooter>;
}

function ResponsiveDialogClose({ children, ...props }: React.ComponentProps<typeof DialogClose>) {
  const isMobile = useIsMobile();
  if (isMobile) return <DrawerClose {...(props as any)}>{children}</DrawerClose>;
  return <DialogClose {...props}>{children}</DialogClose>;
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
