import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { useEffect, useRef } from 'react';

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onEscape?: () => void;
};

export function MarkdownEditor({ value, onChange, onEscape }: MarkdownEditorProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const onEscapeRef = useRef(onEscape);
  onChangeRef.current = onChange;
  onEscapeRef.current = onEscape;

  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) {
      return;
    }

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
          EditorView.theme({
            '&': { height: '100%', fontSize: '13px' },
            '.cm-scroller': { overflow: 'auto' },
            '.cm-content': { fontFamily: 'inherit', padding: '4px 2px' },
            '&.cm-focused': { outline: 'none' },
          }),
        ],
      }),
    });
    view.focus();

    return () => {
      view.destroy();
    };
    // Mount once per editor instance; parent remounts via key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={parentRef} className="nodrag nowheel nopan h-full min-h-[120px]" data-testid="markdown-editor" />;
}
