import { Card, CardContent } from "@/components/ui/card";

export function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-primary">{icon}</span>
          <h2 className="font-semibold text-sm">{title}</h2>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
