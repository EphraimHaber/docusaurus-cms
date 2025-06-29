import {
  useEffect,
  useRef,
  ChangeEvent,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { NodeViewProps, NodeViewWrapper } from '@tiptap/react';
import Editor, { Monaco } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import './MonacoCodeBlockView.css';

// Define the props for our component with proper types
interface MonacoCodeBlockViewProps extends NodeViewProps {}

// Export interface for ref methods
export interface MonacoCodeBlockViewRef {
  focus: () => void;
}

// Define supported programming languages
type ProgrammingLanguage =
  | 'javascript'
  | 'typescript'
  | 'html'
  | 'css'
  | 'json'
  | 'python'
  | 'java'
  | 'csharp'
  | 'php'
  | 'ruby'
  | 'go'
  | 'rust'
  | 'shell';

const debounce = (func: Function, wait: number) => {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function executedFunction(...args: any[]) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
};

const MonacoCodeBlockView = forwardRef<MonacoCodeBlockViewRef, MonacoCodeBlockViewProps>(
  ({ node, updateAttributes, editor, getPos, selected }, ref) => {
    const monacoInstance = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const isUpdatingRef = useRef<boolean>(false);
    const language = node.attrs.language || 'javascript';
    const initialContentRef = useRef<string>(node.textContent);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => {
        if (monacoInstance.current) {
          monacoInstance.current.focus();
        }
      },
    }));

    // Focus the Monaco editor when the node is selected
    useEffect(() => {
      if (selected && monacoInstance.current) {
        monacoInstance.current.focus();
      }
    }, [selected]);

    // Function to insert a new paragraph node before the current node
    const insertNodeBefore = useCallback(() => {
      if (typeof getPos !== 'function') return;

      const pos = getPos();
      if (pos === undefined) return;

      const tr = editor.state.tr;
      const newNode = editor.schema.nodes.paragraph.create();

      tr.insert(pos, newNode);
      editor.view.dispatch(tr);

      // Focus the newly created node
      editor.commands.focus(pos);
    }, [editor, getPos]);

    // Function to insert a new paragraph node after the current node
    const insertNodeAfter = useCallback(() => {
      if (typeof getPos !== 'function') return;

      const pos = getPos();
      if (pos === undefined) return;

      const endPos = pos + node.nodeSize;
      const tr = editor.state.tr;
      const newNode = editor.schema.nodes.paragraph.create();

      tr.insert(endPos, newNode);
      editor.view.dispatch(tr);

      editor.commands.focus(endPos + 1);
    }, [editor, getPos, node.nodeSize]);

    // Handle delete action
    const handleDelete = () => {
      if (typeof getPos === 'function') {
        const pos = getPos();
        const tr = editor.state.tr;
        const nodeAtPos = editor.state.doc.nodeAt(pos);

        if (nodeAtPos) {
          tr.delete(pos, pos + nodeAtPos.nodeSize);
          editor.view.dispatch(tr);
        }
      }
    };

    // Check if this node is the first node in the document
    const isFirstNode = useCallback(() => {
      if (typeof getPos !== 'function') return false;

      const pos = getPos();
      if (pos === undefined) return false;

      // Check if position is 0 (first node)
      return pos === 0;
    }, [getPos]);

    const handleEditorChange = debounce((value: string | undefined) => {
      if (!value || isUpdatingRef.current) return;

      try {
        isUpdatingRef.current = true;

        const pos = getPos();

        const tr = editor.state.tr;

        const originalNode = editor.state.doc.nodeAt(pos);
        if (!originalNode) {
          console.error('Could not find original node');
          return;
        }

        const newNode = editor.schema.nodes[originalNode.type.name].create(
          { ...originalNode.attrs },
          editor.schema.nodeFromJSON({ type: 'text', text: value }),
          originalNode.marks,
        );

        tr.replaceWith(pos, pos + originalNode.nodeSize, newNode);
        editor.view.dispatch(tr);

        initialContentRef.current = value;
      } catch (error) {
        console.error('Error updating code block:', error);
      } finally {
        setTimeout(() => {
          isUpdatingRef.current = false;
        }, 0);
      }
    }, 300);

    const handleEditorMount = (
      editorInstance: monaco.editor.IStandaloneCodeEditor,
      monacoApi: Monaco,
    ) => {
      monacoInstance.current = editorInstance;

      editorInstance.onKeyDown((e) => {
        // Check for ArrowDown key
        if (e.keyCode === monacoApi.KeyCode.DownArrow) {
          const model = editorInstance.getModel();
          const position = editorInstance.getPosition();

          if (model && position) {
            const lastLineNumber = model.getLineCount();
            const lastLineMaxColumn = model.getLineMaxColumn(lastLineNumber);

            // Check if cursor is at the end of the last line
            if (position.lineNumber === lastLineNumber && position.column === lastLineMaxColumn) {
              e.preventDefault();
              e.stopPropagation();

              // Check if this is the last node in the document
              if (typeof getPos === 'function') {
                const pos = getPos();
                if (pos !== undefined) {
                  const endPos = pos + node.nodeSize;
                  const docSize = editor.state.doc.content.size;

                  if (endPos >= docSize) {
                    // It's the last node, insert a new one after
                    insertNodeAfter();
                  } else {
                    // Move focus to the next node in Tiptap
                    monacoInstance.current?.setPosition({ lineNumber: 1, column: 1 });
                    editor.commands.focus(endPos);
                  }
                }
              }
            }
          }
        }

        if (e.keyCode === monacoApi.KeyCode.UpArrow) {
          const model = editorInstance.getModel();
          const position = editorInstance.getPosition();

          if (model && position) {
            if (position.lineNumber === 1 && position.column === 1) {
              e.preventDefault();
              e.stopPropagation();

              // If it's the first node, insert a new paragraph node before it
              if (isFirstNode()) {
                insertNodeBefore();
              } else if (typeof getPos === 'function') {
                monacoInstance.current?.setPosition({ lineNumber: 1, column: 1 });
                const pos = getPos();
                if (pos !== undefined) {
                  editor.commands.focus(pos);
                }
              }
            }
          }
        }

        if (e.keyCode === monacoApi.KeyCode.LeftArrow) {
          const model = editorInstance.getModel();
          const position = editorInstance.getPosition();

          if (model && position) {
            if (position.lineNumber === 1 && position.column === 1) {
              e.preventDefault();
              e.stopPropagation();

              // If it's the first node, insert a new paragraph node before it
              if (isFirstNode()) {
                insertNodeBefore();
              } else if (typeof getPos === 'function') {
                // Move focus to the previous node in Tiptap
                monacoInstance.current?.setPosition({ lineNumber: 1, column: 1 });
                const pos = getPos();
                if (pos !== undefined) {
                  editor.commands.focus(pos);
                }
              }
            }
          }
        }

        if (e.keyCode === monacoApi.KeyCode.RightArrow) {
          const model = editorInstance.getModel();
          const position = editorInstance.getPosition();

          if (model && position) {
            const lastLineNumber = model.getLineCount();
            const lastLineMaxColumn = model.getLineMaxColumn(lastLineNumber);

            if (position.lineNumber === lastLineNumber && position.column === lastLineMaxColumn) {
              e.preventDefault();
              e.stopPropagation();
              if (typeof getPos === 'function') {
                const pos = getPos();
                if (pos !== undefined) {
                  // Move focus to the next node in Tiptap
                  monacoInstance.current?.setPosition({ lineNumber: 1, column: 1 });
                  editor.commands.focus(pos + node.nodeSize);
                }
              }
            }
          }
        }
      });

      // Set focus to this editor if it's the first node
      if (isFirstNode()) {
        setTimeout(() => {
          editorInstance.focus();
        }, 100); // Short delay to ensure editor is fully initialized
      }
    };

    useEffect(() => {
      if (
        monacoInstance.current &&
        !isUpdatingRef.current &&
        node.textContent !== initialContentRef.current
      ) {
        isUpdatingRef.current = true;
        monacoInstance.current.setValue(node.textContent);
        initialContentRef.current = node.textContent;
        setTimeout(() => {
          isUpdatingRef.current = false;
        }, 0);
      }
    }, [node.textContent]);

    const onLanguageChange = (e: ChangeEvent<HTMLSelectElement>) => {
      updateAttributes({ language: e.target.value });
    };

    const handleWrapperClick = (event: React.MouseEvent<HTMLDivElement>) => {
      if (
        wrapperRef.current &&
        event.target === wrapperRef.current &&
        typeof getPos === 'function'
      ) {
        const wrapperRect = wrapperRef.current.getBoundingClientRect();
        const editorRect = event.currentTarget
          .querySelector('.monaco-editor')
          ?.getBoundingClientRect();
        const clickY = event.clientY;

        if (editorRect && clickY > editorRect.bottom && clickY <= wrapperRect.bottom) {
          insertNodeAfter();
        }
      }
    };

    const languages: ProgrammingLanguage[] = [
      'javascript',
      'typescript',
      'html',
      'css',
      'json',
      'python',
      'java',
      'csharp',
      'php',
      'ruby',
      'go',
      'rust',
      'shell',
    ];

    return (
      <NodeViewWrapper
        ref={wrapperRef}
        className="monaco-code-block-wrapper"
        onClick={handleWrapperClick}
      >
        <div className="monaco-code-block">
          <div className="code-block-header" contentEditable={false}>
            <span className="language-label">Language:</span>
            <select
              value={language}
              onChange={onLanguageChange}
              className="language-selector"
              tabIndex={-1}
            >
              {languages.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
            <button
              className="delete-code-block-button"
              onClick={handleDelete}
              title="Delete code block"
              tabIndex={-1}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>
          <div
            className="monaco-editor-container"
            style={{ height: '200px' }}
            contentEditable={false}
          >
            <Editor
              height="200px"
              defaultLanguage={language}
              language={language}
              value={node.textContent}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                fontSize: 14,
                lineNumbers: 'on',
                folding: true,
                tabSize: 2,
              }}
              onChange={handleEditorChange}
              onMount={handleEditorMount}
            />
          </div>
        </div>
      </NodeViewWrapper>
    );
  },
);

export default MonacoCodeBlockView;
