import { Checkbox } from "@/components/ui/checkbox";

export function ConsentItem({
  title,
  text,
  checked,
  onCheck,
  required,
}: {
  title: string;
  text: string;
  checked: boolean;
  onCheck: (v: boolean) => void;
  required?: boolean;
}) {
  return (
    <div className="border rounded-lg p-3">
      <p className="text-sm font-medium mb-1">
        {title}
        {required && <span className="text-destructive ml-1">*</span>}
      </p>
      <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{text}</p>
      <div className="flex items-center gap-2">
        <Checkbox checked={checked} onCheckedChange={(v) => onCheck(!!v)} />
        <span className="text-sm">동의합니다</span>
      </div>
    </div>
  );
}
