import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";

const A4_WIDTH_PX = (210 / 25.4) * 96;
const A4_HEIGHT_PX = (297 / 25.4) * 96;

export interface A4DocumentFrameHandle {
  withFullScale: <T>(fn: () => Promise<T> | T) => Promise<T>;
}

interface A4DocumentFrameProps {
  children: React.ReactNode;
  /**
   * [Task #870] true 면 미리보기 영역의 높이를 A4 1장으로 잠근다.
   *   - inner div 의 높이를 A4_HEIGHT_PX 로 고정해 본문이 넘쳐도 잘려 보인다.
   *   - 외곽 wrapper 도 A4_HEIGHT_PX × scale 로 고정 + overflow:hidden 유지.
   *   - 인쇄/캡처(forceFull) 경로는 영향을 받지 않는다 — withFullScale 안에서는
   *     항상 자연 높이로 복귀해 인쇄 PDF/PNG 가 잘리지 않는다.
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

    const effective = forceFull ? 1 : scale;
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

    const effectiveInnerHeight = lockSinglePage
      ? A4_HEIGHT_PX
      : innerHeight;
    const wrapperHeight = effectiveInnerHeight != null && !forceFull
      ? effectiveInnerHeight * effective
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
