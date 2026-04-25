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
  "우리 건물 준공일?",
  "최근 2개월간 가장 자주 발생한 민원은?",
  "우리 건물 소방안전관리자 선임 기준은?",
  "3개월 내 해야하는 법정점검은?",
];

const FALLBACK_SUGGESTED_PROMPTS = [
  "우리 건물 준공일?",
  "최근 2개월간 가장 자주 발생한 민원은?",
  "우리 건물 소방안전관리자 선임 기준은?",
  "3개월 내 해야하는 법정점검은?",
];

const INSUFFICIENT_INFO_PREFIX = "현재 입력된 정보가 적어 답변이 어렵습니다";
const GENERAL_NOTICE_LABEL = "(일반 안내)";

function isInsufficientInfoAnswer(content: string): boolean {
  return content.trimStart().startsWith(INSUFFICIENT_INFO_PREFIX);
}

/**
 * 답변 본문 끝의 "(일반 안내) ..." 안내문을 분리해 본문과 출처 라벨로 나눈다.
 * 라벨 위치는 본문 마지막 줄(또는 문단 끝)이며, 시스템 프롬프트가 한국어 라벨로
 * 강제 출력하도록 지시한다. 라벨이 없으면 body 만 그대로 반환한다.
 */
function splitGeneralNotice(content: string): { body: string; notice: string | null } {
  const trimmed = content.replace(/\s+$/, "");
  const idx = trimmed.lastIndexOf(GENERAL_NOTICE_LABEL);
  if (idx === -1) return { body: content, notice: null };
  // 마지막 라벨 이후 줄바꿈이 없어야 "끝에 붙은 라벨"로 인정한다 (본문 중간 인용 회피).
  const afterLabel = trimmed.slice(idx);
  if (afterLabel.includes("\n")) return { body: content, notice: null };
  const body = trimmed.slice(0, idx).replace(/\s+$/, "");
  return { body, notice: afterLabel };
}

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
        /* [모바일 앱화] 부모 .layout-content-area 가 이제 100dvh-헤더-네비 로 고정 높이를 가지므로
           negative margin 으로 패딩만 상쇄하고 100% 높이를 차지하면 충분하다. */
        .ai-assistant-fill {
          margin: -12px;
          height: calc(100% + 24px);
        }
        @media (min-width: 640px) and (max-width: 899px) {
          .ai-assistant-fill {
            margin: -24px;
            height: calc(100% + 48px);
          }
        }
        @media (min-width: 900px) {
          .ai-assistant-fill {
            /* desktop: 사이드바만 있고 하단 네비가 없어 본문이 body 스크롤. dvh 기반 유지. */
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
              <h2 className="text-lg font-medium">소장님, 오늘도 함께 풀어볼까요?</h2>
              <p className="text-sm text-muted-foreground">
                민원·보증·점검·관리비, 어떤 질문이든 곁에서 도와드릴게요.
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
            <MessageBubble
              key={msg.id}
              message={msg}
              onSuggestionClick={sendMessage}
              suggestionsDisabled={streaming}
            />
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
              isStreamingPlaceholder
              onSuggestionClick={sendMessage}
              suggestionsDisabled={streaming}
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

function MessageBubble({
  message,
  isStreaming,
  isStreamingPlaceholder,
  onSuggestionClick,
  suggestionsDisabled,
}: {
  message: ChatMessage;
  isStreaming?: boolean;
  isStreamingPlaceholder?: boolean;
  onSuggestionClick?: (text: string) => void;
  suggestionsDisabled?: boolean;
}) {
  const isUser = message.role === "user";
  const hasCitations = !isUser && message.citations && message.citations.length > 0;
  const showFallbackSuggestions =
    !isUser &&
    !isStreamingPlaceholder &&
    !!message.content &&
    isInsufficientInfoAnswer(message.content);
  // 답변 끝에 붙는 "(일반 안내) ..." 출처 라벨은 본문보다 옅게 표시해
  // 일반 지식 답변임을 자연스럽게 구분한다. 사용자 입력에는 적용하지 않는다.
  const { body: bodyText, notice } = !isUser && message.content
    ? splitGeneralNotice(message.content)
    : { body: message.content, notice: null };
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <Card className={`max-w-[80%] ${isUser ? "bg-primary text-primary-foreground" : ""}`}>
        <CardContent className="p-3 space-y-2">
          {isStreaming ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> 정성껏 답변을 준비하고 있어요…
            </div>
          ) : (
            <>
              <p className="whitespace-pre-wrap text-sm leading-relaxed" data-testid={isUser ? "message-user" : "message-assistant"}>
                {bodyText}
              </p>
              {notice && (
                <p
                  className="whitespace-pre-wrap text-xs text-muted-foreground leading-snug"
                  data-testid="message-general-notice"
                >
                  {notice}
                </p>
              )}
            </>
          )}
          {hasCitations && (
            <div className="flex flex-wrap gap-1 pt-2 border-t border-border/40">
              {message.citations.map((c, i) => {
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
              })}
            </div>
          )}
          {showFallbackSuggestions && (
            <div className="space-y-2 pt-2 border-t border-border/40" data-testid="fallback-suggestions">
              <p className="text-xs text-muted-foreground">이런 내용은 어떠신가요?</p>
              <div className="grid gap-2">
                {FALLBACK_SUGGESTED_PROMPTS.map(p => (
                  <Button
                    key={p}
                    variant="outline"
                    size="sm"
                    className="text-left justify-start whitespace-normal h-auto py-2"
                    disabled={suggestionsDisabled || !onSuggestionClick}
                    onClick={() => onSuggestionClick?.(p)}
                    data-testid={`fallback-suggestion-${p}`}
                  >
                    {p}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
