import { markdown } from '@codemirror/lang-markdown';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { useEffect, useRef } from 'react';

import { DEFAULT_MARKDOWN_FONT_SIZE, type MarkdownFontSize } from '@/features/canvas/persist';

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onEscape?: () => void;
  fontSize?: MarkdownFontSize;
};

function editorTheme(fontSize: MarkdownFontSize) {
  return EditorView.theme({
    '&': { height: '100%', fontSize: `${fontSize}px` },
    '.cm-scroller': { overflow: 'auto' },
    '.cm-content': { fontFamily: 'inherit', padding: '4px 2px' },
    '&.cm-focused': { outline: 'none' },
  });
}

export function MarkdownEditor({
  value,
  onChange,
  onEscape,
  fontSize = DEFAULT_MARKDOWN_FONT_SIZE,
}: MarkdownEditorProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartmentRef = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onEscapeRef = useRef(onEscape);
  onChangeRef.current = onChange;
  onEscapeRef.current = onEscape;

  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) {
      return;
    }

    const themeCompartment = themeCompartmentRef.current;
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: value,
        extensions: [
          markdown(),
          EditorView.lineWrapping,
          keymap.of([
            {
              key: 'Escape',
              run: () => {
                onEscapeRef.current?.();
                return true;
              },
            },
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          themeCompartment.of(editorTheme(fontSize)),
        ],
      }),
    });
    viewRef.current = view;
    view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Mount once per editor instance; fontSize updates via Compartment below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    view.dispatch({
      effects: themeCompartmentRef.current.reconfigure(editorTheme(fontSize)),
    });
  }, [fontSize]);

  return <div ref={parentRef} className="nodrag nowheel nopan h-full min-h-[120px]" data-testid="markdown-editor" />;
}
