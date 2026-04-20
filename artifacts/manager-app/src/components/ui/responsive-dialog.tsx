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
}

function ResponsiveDialogContent({ children, className, ...rest }: ContentProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <DrawerContent className={cn("max-h-[90vh]", className)}>
        <div className="min-h-0 overflow-y-auto overflow-x-hidden px-4 pb-4">
          {children}
        </div>
      </DrawerContent>
    );
  }
  return <DialogContent className={className}>{children}</DialogContent>;
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
