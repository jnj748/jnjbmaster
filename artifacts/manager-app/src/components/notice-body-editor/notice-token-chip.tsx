// [Task #591] 위지윅 편집기에서 사용되는 변수 칩 노드.
//   - inline atom node — 칩 한 개가 한 글자처럼 동작해 백스페이스로 통째 삭제 가능.
//   - parseHTML: `<span data-notice-token="...">…</span>` (templateHtmlToEditorHtml 이
//     로드 전에 raw `{{token}}` 텍스트를 이 형태로 감싸 둔다).
//   - renderHTML: 같은 `<span>` 형식 + 안쪽 텍스트로 `{{token}}` 을 둔다.
//     editorHtmlToTemplateHtml 가 다시 평문 `{{token}}` 으로 환원해 저장하므로
//     백엔드 호환을 유지한다.
import {
  Node,
  mergeAttributes,
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type NodeViewProps,
} from "@tiptap/react";
import { useNoticeChipResolver } from "./notice-chip-context";

export interface NoticeTokenChipAttrs {
  token: string;
}

export const NoticeTokenChip = Node.create({
  name: "noticeToken",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  marks: "",

  addAttributes() {
    return {
      token: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-notice-token") ?? "",
        renderHTML: (attrs) => {
          if (!attrs.token) return {};
          return { "data-notice-token": attrs.token };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-notice-token]",
        getAttrs: (node) => {
          if (typeof node === "string") return false;
          const token = node.getAttribute("data-notice-token");
          return token ? { token } : false;
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const token = String(node.attrs.token ?? "");
    // 안쪽 텍스트는 `{{token}}` 으로 둔다 — editorHtmlToTemplateHtml 이 무시하지만
    // 우연히 칩 wrapper 가 누락된 경우에도 renderNoticeBodyHtml 이 토큰 치환을 할 수
    // 있도록 안전망 역할을 한다.
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-notice-token": token,
        class: "notice-token-chip",
      }),
      `{{${token}}}`,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(NoticeTokenChipView);
  },
});

function NoticeTokenChipView(props: NodeViewProps) {
  const resolver = useNoticeChipResolver();
  const token = String(props.node.attrs.token ?? "");
  const display = token ? resolver.display(token) : "";
  const isFilled = resolver.mode === "filled" && resolver.values[token] != null && resolver.values[token].trim() !== "";

  return (
    <NodeViewWrapper
      as="span"
      className={`notice-token-chip${isFilled ? " is-filled" : ""}`}
      data-token={token}
      data-testid={`notice-chip-${token}`}
      // atom 노드 내부는 편집 불가 — 칩 단위로 선택/삭제만 가능.
      contentEditable={false}
    >
      {display}
    </NodeViewWrapper>
  );
}
