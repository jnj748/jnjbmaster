import type { ComponentType, LazyExoticComponent } from "react";

export type WidgetSpan = "full" | "half" | "third" | "quarter";

/**
 * Catalog widgets are always rendered without props by the shell, so they
 * are typed as zero-prop components. If a future widget needs configuration
 * it should read it from context or a hook, not from a positional prop.
 */
export type WidgetComponent =
  | ComponentType<Record<string, never>>
  | LazyExoticComponent<ComponentType<Record<string, never>>>;

export interface WidgetDefinition {
  /** Stable identifier for catalog lookup. */
  key: string;
  /** Component rendering the widget body. Must take no props. */
  component: WidgetComponent;
  /** Desktop column span hint (mobile is always 1 column). */
  span?: WidgetSpan;
  /** Optional human label (debug / future widget picker UI). */
  label?: string;
}
