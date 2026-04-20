import { Component, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  widgetKey?: string;
}

interface State {
  hasError: boolean;
  message?: string;
}

/**
 * Per-widget error boundary so a single broken widget can never blank
 * the whole dashboard shell. The shell wraps every widget in this.
 */
export class WidgetErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: unknown) {
    // eslint-disable-next-line no-console
    console.error(`[dashboard-widget:${this.props.widgetKey ?? "?"}]`, err);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-destructive">위젯을 불러오지 못했습니다</p>
            <p className="text-xs text-muted-foreground mt-1">
              {this.props.widgetKey ?? "widget"} · {this.state.message ?? "unknown error"}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }
}
