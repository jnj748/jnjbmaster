// [Task #434] 한국 표준 전화번호 자동 포맷 입력 컴포넌트.
//
// 기존 `Input` 을 감싼 얇은 wrapper. onChange 가 호출되면 입력값에서 숫자만
// 추출 → 길이/시작 번호별 규칙으로 하이픈을 삽입한 뒤, 부모에 합성 이벤트를
// 다시 흘려준다. 부모는 항상 "포맷된 문자열" 만 받는다.
//
// 백스페이스/중간 삽입 시에도 커서 위치가 자연스럽게 유지되도록, 변경 직후
// 입력의 "커서 앞에 있던 숫자 개수" 를 기준으로 새 커서 위치를 다시 계산해
// `useLayoutEffect` 에서 복원한다.
import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatPhoneNumberPartial } from "@/lib/format-korean";

type BaseInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "type" | "value" | "onChange"
>;

export interface PhoneInputProps extends BaseInputProps {
  value: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  function PhoneInput({ value, onChange, ...props }, forwardedRef) {
    const innerRef = React.useRef<HTMLInputElement | null>(null);
    const desiredCursorRef = React.useRef<number | null>(null);

    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        innerRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          (forwardedRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
        }
      },
      [forwardedRef],
    );

    React.useLayoutEffect(() => {
      if (innerRef.current && desiredCursorRef.current !== null) {
        const pos = desiredCursorRef.current;
        try {
          innerRef.current.setSelectionRange(pos, pos);
        } catch {
          // some input types (e.g. focus race) may throw — safe to ignore.
        }
        desiredCursorRef.current = null;
      }
    });

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const target = e.target;
      const newRaw = target.value;
      const cursorPos = target.selectionStart ?? newRaw.length;

      // 커서 앞쪽에 있던 숫자 개수를 기억해뒀다가, 포맷팅 후 같은 자릿수
      // 뒤에 커서를 두면 자연스럽게 동작한다.
      const digitsBeforeCursor = newRaw.slice(0, cursorPos).replace(/\D/g, "").length;
      const formatted = formatPhoneNumberPartial(newRaw);

      let newCursor = formatted.length;
      if (digitsBeforeCursor === 0) {
        newCursor = 0;
      } else {
        let count = 0;
        for (let i = 0; i < formatted.length; i++) {
          if (/\d/.test(formatted[i])) {
            count++;
            if (count === digitsBeforeCursor) {
              newCursor = i + 1;
              break;
            }
          }
        }
      }
      desiredCursorRef.current = newCursor;

      if (onChange) {
        const synthetic = {
          ...e,
          target: { ...target, value: formatted, name: target.name },
          currentTarget: { ...target, value: formatted, name: target.name },
        } as unknown as React.ChangeEvent<HTMLInputElement>;
        onChange(synthetic);
      }
    }

    return (
      <Input
        ref={setRefs}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        maxLength={14}
        value={value ?? ""}
        onChange={handleChange}
        {...props}
      />
    );
  },
);
