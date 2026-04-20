import * as React from "react"

import { cn } from "@/lib/utils"

const PICKER_TYPES = new Set(["date", "time", "datetime-local", "month", "week"])

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onClick, onFocus, ...props }, ref) => {
    const isPickerType = type ? PICKER_TYPES.has(type) : false
    const tryShowPicker = (el: HTMLInputElement) => {
      if (!isPickerType) return
      const anyEl = el as HTMLInputElement & { showPicker?: () => void }
      if (typeof anyEl.showPicker === "function") {
        try { anyEl.showPicker() } catch { /* ignored: requires user activation or unsupported */ }
      }
    }
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          isPickerType && "cursor-pointer",
          className
        )}
        ref={ref}
        onClick={(e) => {
          tryShowPicker(e.currentTarget)
          onClick?.(e)
        }}
        onFocus={(e) => {
          tryShowPicker(e.currentTarget)
          onFocus?.(e)
        }}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
