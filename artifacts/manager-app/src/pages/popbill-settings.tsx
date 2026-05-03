// [Task #781] T10 외부연동 — Popbill 설정 화면.
//   발신번호 / 카카오 발신 프로필 ID / 템플릿 코드 매핑(JSON) 저장.

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useBuilding } from "@/contexts/building-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

const TEMPLATE_KEYS = [
  { key: "bill_issued", label: "관리비 고지서 발행" },
  { key: "payment_completed", label: "납부 완료 안내" },
  { key: "delinquent_reminder", label: "연체 안내" },
  { key: "delinquent_final", label: "연체 최종(법조치 전)" },
] as const;

export default function PopbillSettingsPage() {
  const { token } = useAuth();
  const { building } = useBuilding();
  const selectedBuildingId = building?.id ?? null;
  const { toast } = useToast();

  const [senderNumber, setSenderNumber] = useState("");
  const [senderProfileId, setSenderProfileId] = useState("");
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!token || !selectedBuildingId) return;
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/dispatch/popbill-settings?buildingId=${selectedBuildingId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setSenderNumber(data?.settings?.senderNumber ?? "");
      setSenderProfileId(data?.settings?.senderProfileId ?? "");
      setTemplates(data?.settings?.kakaoTemplates ?? {});
    } catch (e) {
      toast({ title: "설정 불러오기 실패", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token, selectedBuildingId]);

  const save = async () => {
    if (!token || !selectedBuildingId) return;
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE}/dispatch/popbill-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          buildingId: selectedBuildingId,
          senderNumber: senderNumber.trim() || null,
          senderProfileId: senderProfileId.trim() || null,
          kakaoTemplates: templates,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: "Popbill 설정이 저장되었습니다" });
    } catch (e) {
      toast({ title: "저장 실패", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-4 max-w-2xl">
      <h1 className="text-2xl font-bold">Popbill 발송 설정</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">발신 정보</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>발신번호 (등록된 SMS/LMS 발신번호)</Label>
            <Input value={senderNumber} onChange={(e) => setSenderNumber(e.target.value)} placeholder="01012345678" />
          </div>
          <div>
            <Label>카카오 발신 프로필 ID</Label>
            <Input value={senderProfileId} onChange={(e) => setSenderProfileId(e.target.value)} placeholder="@profile-key" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">알림톡 템플릿 코드</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {TEMPLATE_KEYS.map((t) => (
            <div key={t.key}>
              <Label>{t.label}</Label>
              <Input
                value={templates[t.key] ?? ""}
                onChange={(e) => setTemplates({ ...templates, [t.key]: e.target.value })}
                placeholder="템플릿 코드"
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            템플릿 코드 미설정 시 LMS 로 자동 폴백됩니다(채널이 popbill_kakao 일 때 동일 메시지로 발송).
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={load} disabled={loading}>다시 불러오기</Button>
        <Button onClick={save} disabled={saving || loading}>{saving ? "저장 중..." : "저장"}</Button>
      </div>
    </div>
  );
}
