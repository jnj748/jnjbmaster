import type { ComponentType, LazyExoticComponent } from "react";

export type WidgetSpan = "full" | "half" | "third" | "quarter";

// Catalog widgets are rendered without props by the shell.
export type WidgetComponent =
  | ComponentType<Record<string, never>>
  | LazyExoticComponent<ComponentType<Record<string, never>>>;

export interface WidgetDefinition {
  key: string;
  component: WidgetComponent;
  span?: WidgetSpan;
  label?: string;
}
