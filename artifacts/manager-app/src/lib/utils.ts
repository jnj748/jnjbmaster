import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return "";
  return d.includes("T") ? d.split("T")[0] : d;
}
