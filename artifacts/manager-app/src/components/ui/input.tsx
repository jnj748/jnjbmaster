import * as React from "react"

import { cn } from "@/lib/utils"
import { DatePicker } from "@/components/ui/date-picker"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, value, onChange, ...props }, ref) => {
    if (type === "date") {
      const stringValue = typeof value === "string" ? value : value == null ? "" : String(value)
      return (
        <DatePicker
          value={stringValue}
          onChange={(newValue) => {
            if (onChange) {
              const synthetic = {
                target: { value: newValue, name: props.name ?? "" },
                currentTarget: { value: newValue, name: props.name ?? "" },
              } as unknown as React.ChangeEvent<HTMLInputElement>
              onChange(synthetic)
            }
          }}
          disabled={props.disabled}
          id={props.id}
          min={typeof props.min === "string" ? props.min : undefined}
          max={typeof props.max === "string" ? props.max : undefined}
          placeholder={typeof props.placeholder === "string" ? props.placeholder : undefined}
          className={className}
        />
      )
    }
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        value={value}
        onChange={onChange}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
