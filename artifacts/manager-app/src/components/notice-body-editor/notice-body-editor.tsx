// [Task #591] 본사 관리자(공지문 템플릿) / 관리소장(공지문 작성) 가 공유하는
//   위지윅 편집기. raw HTML + `{{token}}` 형식을 입력/출력으로 사용해
//   기존 저장 포맷과 100% 호환된다.
//   - 기본 툴바: 굵게/기울임/밑줄/제목 H2-H3/목록(글머리·번호)/정렬/링크/되돌리기.
//   - 표 도구: 표 삽입, 행/열 추가·삭제, 셀 병합·분할, 헤더 행 토글.
//   - "변수 삽입" 드롭다운: 9개 표준 토큰을 칩으로 삽입.
//   - 칩 표시 모드: 'token'(라벨만) / 'filled'(우리 건물 실제값으로 치환).
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link2,
  Link2Off,
  Undo2,
  Redo2,
  Variable,
  Table as TableIcon,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  NoticeChipResolverProvider,
  type NoticeChipMode,
} from "./notice-chip-context";
import { NoticeTokenChip } from "./notice-token-chip";
import {
  NOTICE_TOKEN_DEFS,
  buildNoticeTokenLabels,
  templateHtmlToEditorHtml,
  editorHtmlToTemplateHtml,
} from "@/lib/notice-layout";

export interface NoticeBodyEditorHandle {
  /** 편집기 본문을 주어진 raw 템플릿 HTML(`{{token}}` 포함) 로 강제 교체. */
  setTemplateHtml(html: string): void;
  /** 현재 편집기 내용을 raw 템플릿 HTML 로 직렬화. */
  getTemplateHtml(): string;
  /** 내부 Tiptap 인스턴스 — 테스트/외부 명령용. */
  getEditor(): Editor | null;
  /**
   * [Task #608] 본문 커서 위치에 변수 칩을 삽입한다. HQ 관리자 화면의
   *   "사용 가능한 가변항목" 패널이 외부에서 호출.
   */
  insertToken(token: string): void;
}

export interface NoticeBodyEditorProps {
  /** 최초 진입 시 편집기에 채울 템플릿 HTML. */
  initialHtml: string;
  /** 칩 표시 모드. */
  mode: NoticeChipMode;
  /** customA/B/C 라벨 (관리자가 정의한 사용자 입력칸 라벨). */
  customLabels?: { a?: string; b?: string; c?: string };
  /** 모드 'filled' 일 때 사용할 토큰별 실제값. */
  values?: Record<string, string | null | undefined>;
  /** 본문이 변경될 때마다 raw 템플릿 HTML 로 직렬화한 결과를 부모에 전달. */
  onChange?: (templateHtml: string) => void;
  /** 부가 className. */
  className?: string;
  /** 편집기 영역 최소 높이 클래스. */
  minHeightClassName?: string;
  /** data-testid prefix — 부모 컴포넌트가 e2e 테스트로 식별. */
  testIdPrefix?: string;
  /** 비활성화. */
  disabled?: boolean;
}

export const NoticeBodyEditor = forwardRef<NoticeBodyEditorHandle, NoticeBodyEditorProps>(
  function NoticeBodyEditor(props, ref) {
    const {
      initialHtml,
      mode,
      customLabels,
      values,
      onChange,
      className,
      minHeightClassName = "min-h-[280px]",
      testIdPrefix = "notice-body-editor",
      disabled = false,
    } = props;

    const onChangeRef = useRef(onChange);
    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    const editor = useEditor({
      // 한 번 mount 된 뒤에는 편집기가 자체적으로 상태를 보유한다.
      // initialHtml 이 외부에서 바뀌어도 자동 재로드하지 않는다 — 의도적인 reset/load 는
      // ref.setTemplateHtml() 로 호출자가 명시적으로 트리거.
      editable: !disabled,
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3] },
          // Tiptap 기본 link 와 충돌하므로 비활성화하고 우리가 따로 등록.
          // (StarterKit v2 에는 link 가 포함되지 않을 수 있어 명시 옵션 없음.)
        }),
        Underline,
        TextAlign.configure({
          types: ["heading", "paragraph"],
          alignments: ["left", "center", "right"],
        }),
        Link.configure({
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        }),
        Table.configure({ resizable: false }),
        TableRow,
        TableHeader,
        TableCell,
        NoticeTokenChip,
      ],
      content: templateHtmlToEditorHtml(initialHtml ?? ""),
      // [Task #591] Tiptap SSR 가드 — 서버에서 렌더되지 않지만 Vite + React 19 에서
      //   hydration warning 을 피하기 위해 명시한다.
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: cn(
            "prose prose-sm max-w-none focus:outline-none px-3 py-2",
            "prose-headings:font-bold prose-h2:text-xl prose-h3:text-base",
            "prose-table:text-sm prose-table:border-collapse prose-table:w-full",
            // table 셀 시각화 (Tiptap 기본 스타일이 약함).
            minHeightClassName,
          ),
          "data-testid": `${testIdPrefix}-content`,
        },
      },
      onUpdate({ editor: ed }) {
        const html = ed.getHTML();
        const template = editorHtmlToTemplateHtml(html);
        onChangeRef.current?.(template);
      },
    });

    useImperativeHandle(
      ref,
      () => ({
        setTemplateHtml(html: string) {
          if (!editor) return;
          // Tiptap v2: setContent(content, emitUpdate?, parseOptions?)
          editor.commands.setContent(templateHtmlToEditorHtml(html ?? ""), false);
          // emitUpdate=false 로 onChange 가 발화하지 않으므로 부모에 변경된 값을 전달.
          const next = editorHtmlToTemplateHtml(editor.getHTML());
          onChangeRef.current?.(next);
        },
        getTemplateHtml() {
          if (!editor) return "";
          return editorHtmlToTemplateHtml(editor.getHTML());
        },
        getEditor() {
          return editor;
        },
        insertToken(token: string) {
          if (!editor || !token) return;
          editor
            .chain()
            .focus()
            .insertContent({ type: "noticeToken", attrs: { token } })
            .run();
        },
      }),
      [editor],
    );

    // disabled 변경 시 편집 가능 여부를 반영.
    useEffect(() => {
      if (!editor) return;
      editor.setEditable(!disabled);
    }, [editor, disabled]);

    return (
      <NoticeChipResolverProvider mode={mode} customLabels={customLabels} values={values}>
        <div
          className={cn(
            "rounded-md border border-input bg-background",
            disabled && "opacity-60 pointer-events-none",
            className,
          )}
          data-testid={testIdPrefix}
        >
          <Toolbar editor={editor} testIdPrefix={testIdPrefix} customLabels={customLabels} mode={mode} />
          <div className="border-t border-input bg-white">
            <EditorContent editor={editor} />
          </div>
        </div>
      </NoticeChipResolverProvider>
    );
  },
);

interface ToolbarProps {
  editor: Editor | null;
  testIdPrefix: string;
  customLabels?: { a?: string; b?: string; c?: string };
  /** [Task #608] 'filled' (관리소장) 모드에서는 "변수 삽입" 드롭다운을 숨긴다. */
  mode: NoticeChipMode;
}

function Toolbar({ editor, testIdPrefix, customLabels, mode }: ToolbarProps) {
  // editor.isActive 등 변화에 맞춰 toolbar UI 가 갱신되도록 selection update 를 구독.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const handler = () => forceTick((n) => (n + 1) % 1024);
    editor.on("selectionUpdate", handler);
    editor.on("transaction", handler);
    editor.on("update", handler);
    return () => {
      editor.off("selectionUpdate", handler);
      editor.off("transaction", handler);
      editor.off("update", handler);
    };
  }, [editor]);

  const tokenLabels = useMemo(() => buildNoticeTokenLabels(customLabels ?? {}), [customLabels?.a, customLabels?.b, customLabels?.c]);

  if (!editor) {
    return <div className="flex flex-wrap items-center gap-1 p-1.5" />;
  }
  // editor 가 정의됐음을 narrow — 아래 헬퍼들이 동일 변수 ed 를 capture 하도록.
  const ed: Editor = editor;

  function btn({
    icon,
    label,
    active,
    onClick,
    testId,
    disabled,
  }: {
    icon: ReactNode;
    label: string;
    active?: boolean;
    onClick: () => void;
    testId: string;
    disabled?: boolean;
  }): ReactNode {
    return (
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-pressed={!!active}
        disabled={disabled}
        data-testid={testId}
        onMouseDown={(e) => {
          // editor 포커스를 잃지 않도록 default 차단.
          e.preventDefault();
        }}
        onClick={onClick}
        className={cn(
          "h-7 px-2 inline-flex items-center justify-center rounded text-slate-600",
          "border border-transparent",
          active && "bg-slate-200 text-slate-900 border-slate-300",
          !active && "hover:bg-slate-100",
          disabled && "opacity-40 cursor-not-allowed",
        )}
      >
        {icon}
      </button>
    );
  }

  function handleInsertToken(token: string) {
    ed
      .chain()
      .focus()
      .insertContent({
        type: "noticeToken",
        attrs: { token },
      })
      .run();
  }

  function handleSetLink() {
    const prev = ed.getAttributes("link").href as string | undefined;
    const url = window.prompt("링크 URL", prev ?? "https://");
    if (url == null) return; // 취소
    if (url === "") {
      ed.chain().focus().unsetLink().run();
      return;
    }
    ed.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  function handleInsertTable() {
    ed.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 p-1.5 bg-slate-50 rounded-t-md">
      {btn({
        icon: <Bold className="w-3.5 h-3.5" />,
        label: "굵게",
        active: editor.isActive("bold"),
        onClick: () => editor.chain().focus().toggleBold().run(),
        testId: `${testIdPrefix}-toolbar-bold`,
      })}
      {btn({
        icon: <Italic className="w-3.5 h-3.5" />,
        label: "기울임",
        active: editor.isActive("italic"),
        onClick: () => editor.chain().focus().toggleItalic().run(),
        testId: `${testIdPrefix}-toolbar-italic`,
      })}
      {btn({
        icon: <UnderlineIcon className="w-3.5 h-3.5" />,
        label: "밑줄",
        active: editor.isActive("underline"),
        onClick: () => editor.chain().focus().toggleUnderline().run(),
        testId: `${testIdPrefix}-toolbar-underline`,
      })}

      <Divider />

      {btn({
        icon: <Heading2 className="w-3.5 h-3.5" />,
        label: "제목 H2",
        active: editor.isActive("heading", { level: 2 }),
        onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        testId: `${testIdPrefix}-toolbar-h2`,
      })}
      {btn({
        icon: <Heading3 className="w-3.5 h-3.5" />,
        label: "제목 H3",
        active: editor.isActive("heading", { level: 3 }),
        onClick: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        testId: `${testIdPrefix}-toolbar-h3`,
      })}

      <Divider />

      {btn({
        icon: <List className="w-3.5 h-3.5" />,
        label: "글머리 목록",
        active: editor.isActive("bulletList"),
        onClick: () => editor.chain().focus().toggleBulletList().run(),
        testId: `${testIdPrefix}-toolbar-bullet`,
      })}
      {btn({
        icon: <ListOrdered className="w-3.5 h-3.5" />,
        label: "번호 목록",
        active: editor.isActive("orderedList"),
        onClick: () => editor.chain().focus().toggleOrderedList().run(),
        testId: `${testIdPrefix}-toolbar-ordered`,
      })}

      <Divider />

      {btn({
        icon: <AlignLeft className="w-3.5 h-3.5" />,
        label: "왼쪽 정렬",
        active: editor.isActive({ textAlign: "left" }),
        onClick: () => editor.chain().focus().setTextAlign("left").run(),
        testId: `${testIdPrefix}-toolbar-align-left`,
      })}
      {btn({
        icon: <AlignCenter className="w-3.5 h-3.5" />,
        label: "가운데 정렬",
        active: editor.isActive({ textAlign: "center" }),
        onClick: () => editor.chain().focus().setTextAlign("center").run(),
        testId: `${testIdPrefix}-toolbar-align-center`,
      })}
      {btn({
        icon: <AlignRight className="w-3.5 h-3.5" />,
        label: "오른쪽 정렬",
        active: editor.isActive({ textAlign: "right" }),
        onClick: () => editor.chain().focus().setTextAlign("right").run(),
        testId: `${testIdPrefix}-toolbar-align-right`,
      })}

      <Divider />

      {btn({
        icon: <Link2 className="w-3.5 h-3.5" />,
        label: "링크",
        active: editor.isActive("link"),
        onClick: handleSetLink,
        testId: `${testIdPrefix}-toolbar-link`,
      })}
      {btn({
        icon: <Link2Off className="w-3.5 h-3.5" />,
        label: "링크 해제",
        onClick: () => editor.chain().focus().unsetLink().run(),
        testId: `${testIdPrefix}-toolbar-unlink`,
        disabled: !editor.isActive("link"),
      })}

      <Divider />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            data-testid={`${testIdPrefix}-toolbar-table`}
            onMouseDown={(e) => e.preventDefault()}
          >
            <TableIcon className="w-3.5 h-3.5" />표<ChevronDown className="w-3 h-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          // 클릭 시 editor 포커스 유지를 위해 mousedown 차단.
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DropdownMenuItem
            onSelect={() => handleInsertTable()}
            data-testid={`${testIdPrefix}-toolbar-table-insert`}
          >
            표 삽입 (3행 × 3열)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!editor.can().addRowAfter()}
            onSelect={() => editor.chain().focus().addRowAfter().run()}
            data-testid={`${testIdPrefix}-toolbar-table-row-after`}
          >
            아래 행 추가
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!editor.can().addRowBefore()}
            onSelect={() => editor.chain().focus().addRowBefore().run()}
          >
            위 행 추가
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!editor.can().deleteRow()}
            onSelect={() => editor.chain().focus().deleteRow().run()}
            data-testid={`${testIdPrefix}-toolbar-table-row-delete`}
          >
            행 삭제
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!editor.can().addColumnAfter()}
            onSelect={() => editor.chain().focus().addColumnAfter().run()}
            data-testid={`${testIdPrefix}-toolbar-table-col-after`}
          >
            오른쪽 열 추가
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!editor.can().addColumnBefore()}
            onSelect={() => editor.chain().focus().addColumnBefore().run()}
          >
            왼쪽 열 추가
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!editor.can().deleteColumn()}
            onSelect={() => editor.chain().focus().deleteColumn().run()}
            data-testid={`${testIdPrefix}-toolbar-table-col-delete`}
          >
            열 삭제
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!editor.can().mergeCells()}
            onSelect={() => editor.chain().focus().mergeCells().run()}
            data-testid={`${testIdPrefix}-toolbar-table-merge`}
          >
            셀 병합
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!editor.can().splitCell()}
            onSelect={() => editor.chain().focus().splitCell().run()}
            data-testid={`${testIdPrefix}-toolbar-table-split`}
          >
            셀 분할
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!editor.can().toggleHeaderRow()}
            onSelect={() => editor.chain().focus().toggleHeaderRow().run()}
            data-testid={`${testIdPrefix}-toolbar-table-header-row`}
          >
            헤더 행 토글
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!editor.can().deleteTable()}
            onSelect={() => editor.chain().focus().deleteTable().run()}
            data-testid={`${testIdPrefix}-toolbar-table-delete`}
            className="text-rose-600"
          >
            표 삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* [Task #608] 변수 삽입 도구는 본사 관리자(mode='token') 에만 노출.
            관리소장(mode='filled') 화면은 이미 칩이 자동 치환되므로 새 변수
            삽입이 필요 없고, "사용 가능한 가변항목" 패널은 본사 관리자
            편집 다이얼로그가 별도로 보여준다. */}
      {mode === "token" && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                data-testid={`${testIdPrefix}-toolbar-insert-variable`}
                onMouseDown={(e) => e.preventDefault()}
              >
                <Variable className="w-3.5 h-3.5" />변수 삽입<ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="max-h-72 overflow-y-auto"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <DropdownMenuLabel className="text-[11px] text-slate-500">
                클릭하면 본문에 칩으로 삽입됩니다
              </DropdownMenuLabel>
              {NOTICE_TOKEN_DEFS.map((def) => (
                <DropdownMenuItem
                  key={def.token}
                  onSelect={() => handleInsertToken(def.token)}
                  data-testid={`${testIdPrefix}-insert-token-${def.token}`}
                >
                  <span className="text-xs text-slate-500 mr-2 w-5 text-center">＋</span>
                  <span className="font-medium">{tokenLabels[def.token] ?? def.defaultLabel}</span>
                  <span className="ml-auto text-[10px] text-slate-400">{`{{${def.token}}}`}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Divider />
        </>
      )}

      {btn({
        icon: <Undo2 className="w-3.5 h-3.5" />,
        label: "되돌리기",
        onClick: () => editor.chain().focus().undo().run(),
        testId: `${testIdPrefix}-toolbar-undo`,
        disabled: !editor.can().undo(),
      })}
      {btn({
        icon: <Redo2 className="w-3.5 h-3.5" />,
        label: "다시 실행",
        onClick: () => editor.chain().focus().redo().run(),
        testId: `${testIdPrefix}-toolbar-redo`,
        disabled: !editor.can().redo(),
      })}
    </div>
  );
}

function Divider() {
  return <span className="mx-1 inline-block w-px h-5 bg-slate-300" aria-hidden />;
}
