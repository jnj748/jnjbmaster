import type { ReactNode } from "react";

type Props = {
  title: string;
  period: string;
  children: ReactNode;
};

export function A4Frame({ title, period, children }: Props) {
  return (
    <div className="print-wrapper">
      <div className="a4-frame">
        <h2>{title}</h2>
        <div className="meta">
          <span>{period}</span>
          <span>출력일: {new Date().toLocaleDateString("ko-KR")}</span>
        </div>
        {children}
      </div>
    </div>
  );
}
