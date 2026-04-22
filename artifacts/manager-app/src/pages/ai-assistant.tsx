import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Send, Sparkles, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  maintenance_log: "시설일지",
  complaint: "민원",
  inspection: "점검",
  tax_schedule: "세무",
  contract: "계약",
};

const CITATION_TYPE_HREFS: Record<string, string | null> = {
  warranty: null,
  maintenance_log: "/maintenance-logs",
  complaint: "/erp/governance",
  inspection: "/inspections",
  contract: "/contracts",
  tax_schedule: null,
};

export default function AiAssistantPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState("");
  const [streamedCitations, setStreamedCitations] = useState<Citation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  const loadInitial = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/ai/sessions`, { headers: authHeaders() });
      if (!res.ok) {
        setLoaded(true);
        return;
      }
      const data: ChatSession[] = await res.json();
      if (data.length === 0) {
        setLoaded(true);
        return;
      }
      // Use the most recently updated session as the persistent conversation.
      const latest = data[0];
      setActiveSessionId(latest.id);
      const mr = await fetch(`${API_BASE}/ai/sessions/${latest.id}/messages`, { headers: authHeaders() });
      if (mr.ok) {
        const msgs: ChatMessage[] = await mr.json();
        setMessages(msgs);
      }
    } finally {
      setLoaded(true);
    }
  }, [authHeaders]);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamedText]);

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
            if (data.session?.id && !activeSessionId) {
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

      setMessages(prev => [
        ...prev,
        { id: Date.now() + 1, role: "assistant", content: accumulated, citations: finalCitations },
      ]);
      setStreamedText("");
      setStreamedCitations([]);
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
    <>
      {/*
        [Task #235] 부모 layout-content-area 의 padding (p-3 / sm:p-6, padding-bottom: 60px+safe)
        과 채팅창 자체의 높이 계산이 중복으로 차감돼 입력창이 하단 네비 아래로 밀리는 문제를 해결.
        - 음수 마진으로 부모 패딩을 정확히 상쇄해 컨텐츠 영역 전체를 채팅 페이지가 차지하게 한다.
        - 100dvh 기반으로 헤더/하단 네비 실제 높이만 차감해 가상 키보드가 열려도 입력창이 항상 보이게 한다.
        - 데스크탑(≥900px) 에서는 하단 네비가 숨겨지고 좌측 사이드바만 존재하므로 헤더만 차감한다.
      */}
      <style>{`
        .ai-assistant-fill {
          /* mobile: parent has p-3 (12px) + padding-bottom: 60px + safe-area */
          margin: -12px -12px calc(-12px - 60px - env(safe-area-inset-bottom, 0px)) -12px;
          /* mobile header(약 60px) + bottom nav(60px) + safe-area */
          height: calc(100dvh - 60px - 60px - env(safe-area-inset-bottom, 0px));
        }
        @media (min-width: 640px) and (max-width: 899px) {
          .ai-assistant-fill {
            /* tablet (sm+): parent has p-6 (24px), bottom nav still visible */
            margin: -24px -24px calc(-24px - 60px - env(safe-area-inset-bottom, 0px)) -24px;
          }
        }
        @media (min-width: 900px) {
          .ai-assistant-fill {
            /* desktop: parent p-6 (24px), no bottom nav, no safe-area concern */
            margin: -24px;
            height: calc(100dvh - 65px);
          }
        }
      `}</style>
      <div className="ai-assistant-fill flex flex-col p-3 sm:p-4 min-h-0">
        <main className="flex-1 min-h-0 flex flex-col border rounded-md bg-background min-w-0 max-w-3xl w-full mx-auto">
        <header className="flex items-center gap-2 border-b px-4 py-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="font-semibold">AI 관리비서</h1>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {loaded && messages.length === 0 && !streaming && (
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
      </div>
    </>
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
