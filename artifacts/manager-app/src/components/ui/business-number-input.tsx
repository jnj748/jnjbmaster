// [Task #434] 한국 사업자등록번호(10자리) 자동 포맷 입력 컴포넌트.
// 동작은 PhoneInput 과 동일하게 "숫자 카운트 기반 커서 복원" 방식을 사용한다.
import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatBusinessNumber } from "@/lib/format-korean";

type BaseInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "type" | "value" | "onChange"
>;

export interface BusinessNumberInputProps extends BaseInputProps {
  value: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const BusinessNumberInput = React.forwardRef<
  HTMLInputElement,
  BusinessNumberInputProps
>(function BusinessNumberInput({ value, onChange, placeholder, ...props }, forwardedRef) {
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
        /* noop */
      }
      desiredCursorRef.current = null;
    }
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const target = e.target;
    const newRaw = target.value;
    const cursorPos = target.selectionStart ?? newRaw.length;
    const digitsBeforeCursor = newRaw.slice(0, cursorPos).replace(/\D/g, "").length;
    const formatted = formatBusinessNumber(newRaw);

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
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={12}
      placeholder={placeholder ?? "000-00-00000"}
      value={value ?? ""}
      onChange={handleChange}
      {...props}
    />
  );
});
