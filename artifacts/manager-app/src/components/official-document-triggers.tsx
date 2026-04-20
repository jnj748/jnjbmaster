import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Megaphone, ClipboardList } from "lucide-react";
import {
  type OfficialDocumentInput,
  type OfficialDocumentKind,
  storeOfficialDocumentInput,
} from "@/lib/official-document";

interface OfficialDocumentTriggersProps {
  buildInput: () => OfficialDocumentInput;
  disabled?: boolean;
  className?: string;
}

const BUTTONS: { kind: OfficialDocumentKind; label: string; icon: typeof FileText }[] = [
  { kind: "draft", label: "기안서 만들기", icon: FileText },
  { kind: "notice", label: "공고문 만들기", icon: Megaphone },
  { kind: "report", label: "보고서 만들기", icon: ClipboardList },
];

export function OfficialDocumentTriggers({
  buildInput,
  disabled,
  className,
}: OfficialDocumentTriggersProps) {
  const [, setLocation] = useLocation();

  function handleClick(kind: OfficialDocumentKind) {
    if (disabled) return;
    const input = buildInput();
    storeOfficialDocumentInput(input);
    setLocation(`/documents/preview?kind=${kind}`);
  }

  return (
    <Card className={`p-4 space-y-3 ${className ?? ""}`}>
      <div className="space-y-1">
        <p className="text-sm font-semibold">공식 문서로 마무리하기</p>
        <p className="text-xs text-muted-foreground">
          작성한 내용으로 기안서·공고문·보고서를 즉시 만들 수 있습니다.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {BUTTONS.map((b) => {
          const Icon = b.icon;
          return (
            <Button
              key={b.kind}
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => handleClick(b.kind)}
              className="h-auto py-3 flex flex-col items-center gap-1"
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm">{b.label}</span>
            </Button>
          );
        })}
      </div>
      {disabled && (
        <p className="text-xs text-muted-foreground">
          업무를 먼저 완료하면 공문 만들기가 활성화됩니다.
        </p>
      )}
    </Card>
  );
}
