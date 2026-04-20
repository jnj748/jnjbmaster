import { CheckCircle, XCircle } from "lucide-react";

export function DocLink({ label, url, hasFlag }: { label: string; url?: string | null; hasFlag: boolean }) {
  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
        <CheckCircle className="w-3.5 h-3.5 text-green-600" />
        {label}
      </a>
    );
  }
  return (
    <div className="flex items-center gap-1 text-muted-foreground">
      {hasFlag ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> : <XCircle className="w-3.5 h-3.5" />}
      {label}
    </div>
  );
}
