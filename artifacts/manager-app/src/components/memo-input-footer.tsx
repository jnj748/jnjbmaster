// [Task #465] 메모 텍스트 입력칸 바로 아래에 "메모 AI입력" 과 "음성으로 입력"
// 두 버튼을 가로로 나란히 배치하는 표준 푸터. 알림 처리 다이얼로그(처리완료/
// 연기/견적요청)와 업무기록(QuickEntry) 다이얼로그가 공유한다.
//
// 두 버튼 모두 onInsert(text) 콜백을 호출하면, 호출측이 기존 메모 끝에
// 줄바꿈으로 이어 붙이는 누적 패턴을 사용한다(타이핑/음성/AI입력 결과가
// 모두 같은 메모란 한 곳에 누적되도록 하기 위함).

import { Mic } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MemoAiInputButton } from "@/components/memo-ai-input-dialog";
import { VoiceInputDialog } from "@/components/voice-input-dialog";

interface MemoInputFooterProps {
  onInsert: (text: string) => void;
  /**
   * data-testid 접두사. AI입력 트리거 버튼은 `${testId}-ai-trigger`,
   * 음성 트리거 버튼은 `${testId}-voice-trigger` 로 식별된다.
   * 음성 다이얼로그 내부 요소는 기존 voice-input-dialog 의 testid 를 그대로 사용한다.
   */
  testId?: string;
}

export function MemoInputFooter({ onInsert, testId }: MemoInputFooterProps) {
  const [voiceOpen, setVoiceOpen] = useState(false);
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      <MemoAiInputButton
        onInsert={onInsert}
        className="w-full"
        testId={testId ? `${testId}-ai` : "memo-footer-ai"}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => setVoiceOpen(true)}
        data-testid={testId ? `${testId}-voice-trigger` : "memo-footer-voice-trigger"}
        aria-label="음성으로 입력"
      >
        <Mic className="w-4 h-4 mr-1" />
        음성으로 입력
      </Button>
      <VoiceInputDialog
        open={voiceOpen}
        onOpenChange={setVoiceOpen}
        onInsert={(text) => {
          onInsert(text);
          setVoiceOpen(false);
        }}
        title="메모 음성 입력"
      />
    </div>
  );
}
