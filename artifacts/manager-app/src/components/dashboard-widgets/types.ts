import type { ComponentType, LazyExoticComponent } from "react";

export type WidgetSpan = "full" | "half" | "third" | "quarter";

export interface WidgetDefinition {
  /** Stable identifier for catalog lookup. */
  key: string;
  /** Component rendering the widget body. */
  component: ComponentType<any> | LazyExoticComponent<ComponentType<any>>;
  /** Desktop column span hint (mobile is always 1 column). */
  span?: WidgetSpan;
  /** Optional human label (debug / future widget picker UI). */
  label?: string;
}
