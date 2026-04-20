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

    return (
      <div
        ref={outerRef}
        className="a4-document-frame"
        style={{
          height: wrapperHeight,
          overflow: forceFull ? "auto" : "hidden",
        }}
      >
        <div
          ref={innerRef}
          style={{
            width: A4_WIDTH_PX,
            transform: `scale(${effective})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    );
  },
);
