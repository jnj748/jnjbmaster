import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";

const A4_WIDTH_PX = (210 / 25.4) * 96;
const A4_HEIGHT_PX = (297 / 25.4) * 96;

export interface A4DocumentFrameHandle {
  withFullScale: <T>(fn: () => Promise<T> | T) => Promise<T>;
}

interface A4DocumentFrameProps {
  children: React.ReactNode;
  /**
   * [Task #870/#871] true 면 미리보기 영역을 A4 1장 비율로 잠그고,
   *   본문이 A4 1장보다 길면 **비율을 유지한 채 추가로 축소**해 전체가
   *   잘리지 않고 모두 보이도록 한다 (사장님 피드백 #871: "잘려보이면 무슨 의미").
   *   - 외곽 wrapper 높이 = A4_HEIGHT_PX × widthScale (항상 A4 비율 박스).
   *   - 본문 자연 높이가 A4_HEIGHT_PX 를 초과하면 contentFitScale 을 추가 적용
   *     (effectiveScale = widthScale × contentFitScale). 본문은 잘리지 않고
   *     박스 안에 다 보이며 우측에 비례 여백이 생긴다.
   *   - 인쇄/캡처(forceFull) 경로는 영향을 받지 않는다 — withFullScale 안에서는
   *     항상 자연 높이/원본 스케일로 복귀해 인쇄 PDF/PNG 가 잘리지 않는다.
   */
  singlePage?: boolean;
}

export const A4DocumentFrame = forwardRef<A4DocumentFrameHandle, A4DocumentFrameProps>(
  function A4DocumentFrame({ children, singlePage = false }, ref) {
    const outerRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const [innerHeight, setInnerHeight] = useState<number | null>(null);
    const [forceFull, setForceFull] = useState(false);

    useLayoutEffect(() => {
      const outer = outerRef.current;
      if (!outer) return;
      const update = () => {
        const available = outer.clientWidth;
        if (available <= 0) return;
        setScale(Math.min(1, available / A4_WIDTH_PX));
      };
      update();
      const ro = new ResizeObserver(update);
      ro.observe(outer);
      return () => ro.disconnect();
    }, []);

    useEffect(() => {
      const inner = innerRef.current;
      if (!inner) return;
      const update = () => setInnerHeight(inner.scrollHeight);
      update();
      const ro = new ResizeObserver(update);
      ro.observe(inner);
      return () => ro.disconnect();
    }, []);

    const lockSinglePage = singlePage && !forceFull;

    useImperativeHandle(ref, () => ({
      async withFullScale(fn) {
        setForceFull(true);
        await new Promise((r) => setTimeout(r, 80));
        try {
          return await fn();
        } finally {
          setForceFull(false);
        }
      },
    }), []);

    // [Task #871] singlePage 모드일 때 본문이 A4 1장보다 길면 비율 유지한 채
    //   추가로 축소(contentFitScale)해 전체가 잘리지 않게 한다. 본문이 1장
    //   이내면 contentFitScale=1 이라 기존 동작 그대로.
    const contentFitScale = lockSinglePage && innerHeight != null && innerHeight > A4_HEIGHT_PX
      ? A4_HEIGHT_PX / innerHeight
      : 1;
    const effective = forceFull ? 1 : scale * contentFitScale;

    // [Task #870/#871] singlePage 모드에서 wrapper 는 항상 A4 비율 박스
    //   (height = A4_HEIGHT_PX × widthScale). 일반 모드는 본문 자연 높이.
    const wrapperHeight = forceFull
      ? undefined
      : lockSinglePage
        ? A4_HEIGHT_PX * scale
        : innerHeight != null
          ? innerHeight * scale
          : undefined;

    // [Task #543] forceFull(=인쇄/캡처 직전) 일 때는 inline transform 자체를
    //   제거한다. `transform: scale(1)` 처럼 시각적으로 항등(identity) 인
    //   변형도 자손의 `position: absolute` 컨테이닝 블록을 만들어내, .a4-document
    //   가 페이지 좌상단이 아니라 inner div 좌상단을 기준으로 잡혀 좌/우로
    //   밀리는 원인이 됐다. transformOrigin 도 함께 비워 `transform-style`
    //   기반 보조 효과까지 차단한다.
    const innerStyle: React.CSSProperties = forceFull
      ? { width: A4_WIDTH_PX }
      : {
          width: A4_WIDTH_PX,
          transform: `scale(${effective})`,
          transformOrigin: "top left",
        };

    return (
      <div
        ref={outerRef}
        className="a4-document-frame"
        data-print-prepared={forceFull ? "true" : undefined}
        style={{
          height: wrapperHeight,
          overflow: forceFull ? "auto" : "hidden",
        }}
      >
        <div ref={innerRef} style={innerStyle}>
          {children}
        </div>
      </div>
    );
  },
);
