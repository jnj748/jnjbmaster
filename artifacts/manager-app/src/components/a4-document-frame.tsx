import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";

const A4_WIDTH_PX = (210 / 25.4) * 96;

export interface A4DocumentFrameHandle {
  withFullScale: <T>(fn: () => Promise<T> | T) => Promise<T>;
}

interface A4DocumentFrameProps {
  children: React.ReactNode;
}

export const A4DocumentFrame = forwardRef<A4DocumentFrameHandle, A4DocumentFrameProps>(
  function A4DocumentFrame({ children }, ref) {
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

    const wrapperHeight = innerHeight != null && !forceFull ? innerHeight * effective : undefined;

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
