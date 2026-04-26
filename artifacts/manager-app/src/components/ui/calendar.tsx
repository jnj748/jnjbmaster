import * as React from "react"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import {
  DayPicker,
  Dropdown as RdpDropdown,
  type DropdownProps,
  useDayPicker,
  useNavigation,
} from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

const DEFAULT_YEAR_SPAN = 5

// Custom Dropdown wrapper: filters month options to stay within fromDate/toDate
// for the currently-displayed year. RDP only narrows the month dropdown when
// fromDate and toDate share the same year; this widens that protection so a
// boundary year (e.g. fromDate=2026-06-10) only shows months >= June.
//
// NOTE: assumes single-month usage (numberOfMonths === 1). For multi-month
// calendars `useNavigation().currentMonth` is the first visible month, so the
// non-leading captions would all be filtered against the leading month's year.
// If multi-month support is added later, replace this with a custom Caption
// component that has access to its own `displayMonth`.
function BoundedDropdown(props: DropdownProps) {
  const { fromDate, toDate } = useDayPicker()
  const { currentMonth } = useNavigation()

  if (props.name !== "months") {
    return <RdpDropdown {...props} />
  }
  if (!fromDate && !toDate) {
    return <RdpDropdown {...props} />
  }

  const year = currentMonth.getFullYear()
  const minMonth =
    fromDate && year === fromDate.getFullYear() ? fromDate.getMonth() : 0
  const maxMonth =
    toDate && year === toDate.getFullYear() ? toDate.getMonth() : 11

  const filtered = React.Children.toArray(props.children).filter((child) => {
    if (!React.isValidElement<{ value?: number | string }>(child)) return true
    const v = Number(child.props.value)
    return v >= minMonth && v <= maxMonth
  })

  return <RdpDropdown {...props}>{filtered}</RdpDropdown>
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout,
  fromYear,
  toYear,
  fromDate,
  toDate,
  fromMonth,
  toMonth,
  components,
  ...props
}: CalendarProps) {
  const today = new Date()
  const hasExplicitBound =
    fromYear != null ||
    toYear != null ||
    fromDate != null ||
    toDate != null ||
    fromMonth != null ||
    toMonth != null

  // Default ±5y window only when caller passed nothing. We never set fromYear
  // alongside an explicit fromDate: RDP would override the more granular date.
  const defaultFromYear = hasExplicitBound
    ? undefined
    : today.getFullYear() - DEFAULT_YEAR_SPAN
  const defaultToYear = hasExplicitBound
    ? undefined
    : today.getFullYear() + DEFAULT_YEAR_SPAN

  // If caller gave only one bound, complete the other so the year dropdown
  // (which needs both fromDate.year and toDate.year) still renders.
  let resolvedFromDate = fromDate
  let resolvedToDate = toDate
  let resolvedFromYear = fromYear ?? defaultFromYear
  let resolvedToYear = toYear ?? defaultToYear

  if (fromDate && !toDate && toYear == null && toMonth == null) {
    resolvedToYear = fromDate.getFullYear() + DEFAULT_YEAR_SPAN
  }
  if (toDate && !fromDate && fromYear == null && fromMonth == null) {
    resolvedFromYear = toDate.getFullYear() - DEFAULT_YEAR_SPAN
  }
  // RDP precedence: fromMonth > fromYear > fromDate. When caller passed
  // fromDate, drop fromYear so the date-level constraint wins.
  if (fromDate) resolvedFromYear = undefined
  if (toDate) resolvedToYear = undefined

  const resolvedCaptionLayout = captionLayout ?? "dropdown-buttons"

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      captionLayout={resolvedCaptionLayout}
      fromYear={resolvedFromYear}
      toYear={resolvedToYear}
      fromDate={resolvedFromDate}
      toDate={resolvedToDate}
      fromMonth={fromMonth}
      toMonth={toMonth}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label:
          "inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-sm font-medium hover:bg-accent",
        caption_dropdowns: "flex items-center justify-center gap-1",
        dropdown_month: "relative inline-flex items-center",
        dropdown_year: "relative inline-flex items-center",
        dropdown:
          "absolute inset-0 z-10 w-full h-full cursor-pointer opacity-0 appearance-none bg-transparent border-0 p-0",
        dropdown_icon: "ml-1 h-3 w-3 opacity-50",
        vhidden: "sr-only",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell:
          "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
        ),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: () => <ChevronLeft className="h-4 w-4" />,
        IconRight: () => <ChevronRight className="h-4 w-4" />,
        IconDropdown: () => <ChevronDown className="h-3 w-3 opacity-50" />,
        Dropdown: BoundedDropdown,
        ...components,
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
