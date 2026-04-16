import { useState, useEffect, lazy, Suspense } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Settings as SettingsIcon,
  Building,
  User,
  Save,
  Loader2,
  Lock,
  Phone,
  Mail,
  CheckCircle2,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL ?? "/";
const apiBase = `${BASE}api`.replace(/\/+/g, "/");

const BuildingSetup = lazy(() => import("@/pages/building-setup"));

export default function SettingsPage() {
  const { user } = useAuth();
  const canEditBuilding = user?.role === "manager" || user?.role === "platform_admin";
  const [activeTab, setActiveTab] = useState<"building" | "profile">("profile");

  const tabs = [
    { key: "profile" as const, label: "내정보 수정", icon: User },
    ...(canEditBuilding ? [{ key: "building" as const, label: "건물정보 수정", icon: Building }] : []),
  ];

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <SettingsIcon className="w-6 h-6" />
          설정
        </h1>
        <p className="text-sm text-muted-foreground mt-1">내정보 및 건물정보를 관리합니다</p>
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "profile" && <ProfileSettings />}
      {activeTab === "building" && (
        <Suspense fallback={<div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
          <BuildingSetup />
        </Suspense>
      )}
    </div>
  );
}

function ProfileSettings() {
  const { token, user, setUser } = useAuth();
  const { toast } = useToast();

  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setPhone(user.phone || "");
    }
  }, [user]);

  async function handleSaveProfile() {
    if (!name.trim()) {
      toast({ title: "이름을 입력해주세요", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/auth/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });
      const result = await res.json();
      if (res.ok && result.user) {
        if (setUser && user) {
          setUser({ ...user, name: result.user.name, phone: result.user.phone });
        }
        toast({ title: "정보가 수정되었습니다" });
      } else {
        toast({ title: result.error || "수정에 실패했습니다", variant: "destructive" });
      }
    } catch {
      toast({ title: "수정 중 오류가 발생했습니다", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword) {
      toast({ title: "비밀번호를 모두 입력해주세요", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "새 비밀번호가 일치하지 않습니다", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "새 비밀번호는 8자 이상이어야 합니다", variant: "destructive" });
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch(`${apiBase}/auth/me/password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const result = await res.json();
      if (res.ok) {
        toast({ title: "비밀번호가 변경되었습니다" });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        toast({ title: result.error || "비밀번호 변경에 실패했습니다", variant: "destructive" });
      }
    } catch {
      toast({ title: "비밀번호 변경 중 오류가 발생했습니다", variant: "destructive" });
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="w-4 h-4" />
            기본 정보
          </CardTitle>
          <CardDescription>이름과 연락처를 수정할 수 있습니다</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 desktop:grid-cols-2 gap-4">
            <div>
              <Label className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                이메일
              </Label>
              <Input value={user?.email || ""} disabled className="mt-1 bg-muted" />
              <p className="text-xs text-muted-foreground mt-1">이메일은 변경할 수 없습니다</p>
            </div>
            <div>
              <Label className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                이름 *
              </Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="이름을 입력하세요"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                연락처
              </Label>
              <Input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="010-0000-0000"
                className="mt-1"
              />
            </div>
          </div>
          <Button onClick={handleSaveProfile} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            저장
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="w-4 h-4" />
            비밀번호 변경
          </CardTitle>
          <CardDescription>현재 비밀번호를 확인 후 새 비밀번호로 변경합니다</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 desktop:grid-cols-3 gap-4">
            <div>
              <Label>현재 비밀번호</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="현재 비밀번호"
                className="mt-1"
              />
            </div>
            <div>
              <Label>새 비밀번호</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="8자 이상"
                className="mt-1"
              />
            </div>
            <div>
              <Label>새 비밀번호 확인</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="새 비밀번호 확인"
                className="mt-1"
              />
            </div>
          </div>
          {newPassword && confirmPassword && newPassword === confirmPassword && (
            <div className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              비밀번호가 일치합니다
            </div>
          )}
          <Button onClick={handleChangePassword} disabled={changingPassword} variant="outline">
            {changingPassword ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
            비밀번호 변경
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
