import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Send, Trash2, Pencil, MessageSquare, Sparkles, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`;

interface Citation {
  type: string;
  id: number | string;
  label: string;
}
interface ChatSession {
  id: number;
  title: string;
  buildingId: number | null;
  updatedAt: string;
}
interface ChatMessage {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  citations: Citation[];
  createdAt?: string;
}

const SUGGESTED_PROMPTS = [
  "이번 달 미납 호실 알려줘",
  "곧 만료되는 보증 항목은 뭐가 있어?",
  "최근 6개월간 가장 자주 발생한 민원 유형은?",
  "다음 90일 안에 해야 할 법정 점검을 알려줘",
];

const CITATION_TYPE_LABELS: Record<string, string> = {
  warranty: "보증",
  maintenance_log: "기전일지",
  complaint: "민원",
  inspection: "점검",
  tax_schedule: "세무",
  contract: "계약",
};

// Map a citation back to a list page in the manager app. The current pages
// use list-and-dialog navigation rather than per-id routes, so we link to
// the list and let the user locate the row by id/label visible on the chip.
const CITATION_TYPE_HREFS: Record<string, string | null> = {
  warranty: null,
  maintenance_log: "/maintenance-logs",
  complaint: "/complaints",
  inspection: "/inspections",
  contract: "/contracts",
  tax_schedule: null,
};

export default function AiAssistantPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState("");
  const [streamedCitations, setStreamedCitations] = useState<Citation[]>([]);
  const [renameTarget, setRenameTarget] = useState<ChatSession | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ChatSession | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  const loadSessions = useCallback(async () => {
    const res = await fetch(`${API_BASE}/ai/sessions`, { headers: authHeaders() });
    if (!res.ok) return;
    const data: ChatSession[] = await res.json();
    setSessions(data);
    return data;
  }, [authHeaders]);

  const loadMessages = useCallback(
    async (sessionId: number) => {
      const res = await fetch(`${API_BASE}/ai/sessions/${sessionId}/messages`, { headers: authHeaders() });
      if (!res.ok) return;
      const data: ChatMessage[] = await res.json();
      setMessages(data);
    },
    [authHeaders]
  );

  useEffect(() => { loadSessions(); }, [loadSessions]);

  useEffect(() => {
    if (activeSessionId) loadMessages(activeSessionId);
    else setMessages([]);
  }, [activeSessionId, loadMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamedText]);

  const handleNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setInput("");
    setStreamedText("");
    setStreamedCitations([]);
  };

  const handleSelectSession = (id: number) => {
    if (streaming) return;
    setActiveSessionId(id);
    setStreamedText("");
    setStreamedCitations([]);
  };

  const handleDelete = async (sess: ChatSession) => {
    const res = await fetch(`${API_BASE}/ai/sessions/${sess.id}`, {
      method: "DELETE", headers: authHeaders(),
    });
    if (res.ok) {
      if (activeSessionId === sess.id) handleNewChat();
      await loadSessions();
      toast({ title: "대화가 삭제되었습니다." });
    }
    setDeleteTarget(null);
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    const title = renameValue.trim();
    if (!title) return;
    const res = await fetch(`${API_BASE}/ai/sessions/${renameTarget.id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      await loadSessions();
      toast({ title: "대화 제목이 변경되었습니다." });
    }
    setRenameTarget(null);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || streaming) return;

    const userMsg: ChatMessage = {
      id: Date.now(),
      role: "user",
      content: text,
      citations: [],
    };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setStreaming(true);
    setStreamedText("");
    setStreamedCitations([]);

    let currentSessionId = activeSessionId;

    try {
      const res = await fetch(`${API_BASE}/ai/chat`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: activeSessionId ?? undefined, content: text }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        let errorMsg = "AI 응답을 가져오지 못했습니다.";
        try {
          const parsed = JSON.parse(errText) as { error?: string };
          if (parsed?.error) errorMsg = parsed.error;
        } catch {
          // body wasn't JSON; keep default message
        }
        throw new Error(errorMsg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
      let finalCitations: Citation[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const evt of events) {
          const line = evt.split("\n").find(l => l.startsWith("data:"));
          if (!line) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            const data = JSON.parse(payload);
            if (data.session?.id && !currentSessionId) {
              currentSessionId = data.session.id;
              setActiveSessionId(data.session.id);
            }
            if (data.content) {
              accumulated += data.content;
              setStreamedText(accumulated);
            }
            if (data.citations) {
              finalCitations = data.citations;
              setStreamedCitations(data.citations);
            }
            if (data.error) {
              throw new Error(data.error);
            }
          } catch (e) {
            if (e instanceof Error && e.message) throw e;
          }
        }
      }

      // Commit assistant message into messages list
      setMessages(prev => [
        ...prev,
        { id: Date.now() + 1, role: "assistant", content: accumulated, citations: finalCitations },
      ]);
      setStreamedText("");
      setStreamedCitations([]);
      await loadSessions();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "AI 응답 오류",
        description: err instanceof Error ? err.message : "알 수 없는 오류",
      });
    } finally {
      setStreaming(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 p-4">
      {/* Sidebar */}
      <aside className="w-72 shrink-0 hidden md:flex md:flex-col gap-2 border rounded-md p-3 bg-background">
        <Button onClick={handleNewChat} className="w-full" data-testid="button-new-chat">
          <Plus className="mr-2 h-4 w-4" /> 새 대화
        </Button>
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-1">
            {sessions.map(s => (
              <div
                key={s.id}
                className={`group flex items-center justify-between rounded-md px-2 py-2 text-sm cursor-pointer hover-elevate ${
                  s.id === activeSessionId ? "bg-accent" : ""
                }`}
                onClick={() => handleSelectSession(s.id)}
                data-testid={`session-${s.id}`}
              >
                <div className="flex items-center gap-2 truncate">
                  <MessageSquare className="h-4 w-4 shrink-0" />
                  <span className="truncate">{s.title}</span>
                </div>
                <div className="opacity-0 group-hover:opacity-100 flex">
                  <button
                    className="p-1 hover:text-primary"
                    onClick={(e) => { e.stopPropagation(); setRenameTarget(s); setRenameValue(s.title); }}
                    data-testid={`button-rename-${s.id}`}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    className="p-1 hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(s); }}
                    data-testid={`button-delete-${s.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
            {sessions.length === 0 && (
              <p className="text-xs text-muted-foreground px-2 py-4">대화 기록이 없습니다.</p>
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* Main chat */}
      <main className="flex-1 flex flex-col border rounded-md bg-background min-w-0">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="font-semibold">AI 도우미</h1>
          </div>
          <Button size="sm" variant="outline" className="md:hidden" onClick={handleNewChat}>
            <Plus className="h-4 w-4 mr-1" /> 새 대화
          </Button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !streaming && (
            <div className="text-center py-12 space-y-4">
              <Sparkles className="h-12 w-12 mx-auto text-primary" />
              <h2 className="text-lg font-medium">건물 운영에 대해 무엇이든 물어보세요</h2>
              <p className="text-sm text-muted-foreground">
                민원, 보증, 점검, 관리비 등 건물 자료를 바탕으로 답변해 드립니다.
              </p>
              <div className="grid gap-2 max-w-md mx-auto pt-4">
                {SUGGESTED_PROMPTS.map(p => (
                  <Button
                    key={p}
                    variant="outline"
                    className="text-left justify-start whitespace-normal h-auto py-2"
                    onClick={() => sendMessage(p)}
                    data-testid={`suggested-${p}`}
                  >
                    {p}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {streaming && (
            <MessageBubble
              message={{
                id: -1,
                role: "assistant",
                content: streamedText || "",
                citations: streamedCitations,
              }}
              isStreaming={!streamedText}
            />
          )}
        </div>

        <form onSubmit={onSubmit} className="border-t p-3 flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="질문을 입력하세요…"
            className="resize-none min-h-[44px] max-h-32"
            rows={1}
            disabled={streaming}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            data-testid="input-chat"
          />
          <Button type="submit" disabled={streaming || !input.trim()} data-testid="button-send">
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </main>

      {/* Rename dialog */}
      <AlertDialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>대화 이름 변경</AlertDialogTitle>
          </AlertDialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            data-testid="input-rename"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleRename}>저장</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>대화 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 대화를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              className="bg-destructive text-destructive-foreground"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MessageBubble({ message, isStreaming }: { message: ChatMessage; isStreaming?: boolean }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <Card className={`max-w-[80%] ${isUser ? "bg-primary text-primary-foreground" : ""}`}>
        <CardContent className="p-3 space-y-2">
          {isStreaming ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> 답변을 작성 중입니다…
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed" data-testid={isUser ? "message-user" : "message-assistant"}>
              {message.content}
            </p>
          )}
          {!isStreaming && !isUser && (
            <div className="flex flex-wrap gap-1 pt-2 border-t border-border/40">
              {message.citations && message.citations.length > 0 ? (
                message.citations.map((c, i) => {
                  const href = CITATION_TYPE_HREFS[c.type] ?? null;
                  const label = `${CITATION_TYPE_LABELS[c.type] ?? c.type} · ${c.label}`;
                  const testId = `citation-${c.type}-${c.id}`;
                  if (href) {
                    return (
                      <Link key={`${c.type}-${c.id}-${i}`} href={href} data-testid={testId}>
                        <Badge variant="secondary" className="text-xs cursor-pointer hover-elevate">
                          {label}
                        </Badge>
                      </Link>
                    );
                  }
                  return (
                    <Badge key={`${c.type}-${c.id}-${i}`} variant="secondary" className="text-xs" data-testid={testId}>
                      {label}
                    </Badge>
                  );
                })
              ) : (
                <span className="text-xs text-muted-foreground" data-testid="citations-empty">참고 자료 없음</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
