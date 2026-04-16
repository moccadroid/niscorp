import { useMemo, type FC, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useIsMobile } from './use-is-mobile';
import Prism from 'prismjs';
// Grammar load order matters — each prism component depends on its base.
// markup → markup-templating → typescript/javascript → jsx → tsx, and the
// utility languages (json, bash) are independent.
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-markup-templating';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';

// Aliases for common shorthand language hints in fenced code blocks. Maps a
// hint to a grammar name that prism actually has loaded above.
const LANG_ALIASES: Record<string, string> = {
  ts: 'typescript',
  js: 'javascript',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  html: 'markup',
  xml: 'markup',
};

// ═══════════════════════════════════════════════════════════
// MarkdownPane — renders a markdown string with prism.js
// syntax highlighting on fenced code blocks. Library-agnostic;
// used by the canvas pane when the user selects a doc page
// instead of a story.
// ═══════════════════════════════════════════════════════════

type Props = {
  title?: string;
  content: string;
};

const langOf = (className: string | undefined): string | undefined => {
  if (className === undefined) return undefined;
  const match = className.match(/language-(\w+)/);
  return match?.[1];
};

const highlight = (code: string, lang: string | undefined): string => {
  if (lang === undefined) return code;
  const resolved = LANG_ALIASES[lang] ?? lang;
  const grammar = Prism.languages[resolved];
  if (grammar === undefined) return code;
  return Prism.highlight(code, grammar, resolved);
};

type CodeProps = {
  className?: string;
  children?: ReactNode;
};

// Inline code renderer — used for `inline.code`. Subtle background, no border,
// monospace family, slightly smaller than body text.
const InlineCode: FC<{ children?: ReactNode }> = ({ children }) => (
  <code
    style={{
      background: '#eef2ff',
      color: '#3730a3',
      padding: '1px 6px',
      borderRadius: 4,
      fontSize: '0.88em',
      fontFamily: 'ui-monospace, Menlo, monospace',
      fontWeight: 500,
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </code>
);

// Block code (inside <pre>) — syntax highlighted via prism.js when a
// language hint is present. Plain pre when not.
const BlockCode: FC<CodeProps> = ({ className, children }) => {
  const lang = langOf(className);
  const text = typeof children === 'string' ? children : String(children);
  const html = useMemo(() => (lang === undefined ? text : highlight(text, lang)), [text, lang]);
  if (lang === undefined) {
    return (
      <code
        style={{
          fontFamily: 'ui-monospace, Menlo, monospace',
          fontSize: 12.5,
          color: '#d4d4d4',
          lineHeight: 1.6,
        }}
      >
        {children}
      </code>
    );
  }
  return (
    <code
      className={`language-${lang}`}
      style={{
        fontFamily: 'ui-monospace, Menlo, monospace',
        fontSize: 12.5,
        color: '#d4d4d4',
        lineHeight: 1.6,
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

// Code dispatcher: react-markdown's `code` slot is used for both inline and
// block code. The `inline` prop's reliability depends on the plugin chain,
// so we don't trust it alone — instead we use it as a hint AND fall back
// to a content-based heuristic: block code (anything inside a fenced ```)
// always contains a trailing newline; inline code never does. A code element
// with a `language-*` className is also unambiguously a block.
const isBlockCode = (className: string | undefined, children: ReactNode, inline: boolean | undefined): boolean => {
  if (inline === true) return false;
  if (className !== undefined && className.includes('language-')) return true;
  // Trailing newline = block code (markdown adds it before the closing ```).
  if (typeof children === 'string' && children.includes('\n')) return true;
  return false;
};

const Code: FC<CodeProps & { inline?: boolean }> = ({ className, children, inline }) => {
  if (isBlockCode(className, children, inline)) {
    return <BlockCode className={className}>{children}</BlockCode>;
  }
  return <InlineCode>{children}</InlineCode>;
};

const Pre: FC<{ children?: ReactNode }> = ({ children }) => (
  <pre
    style={{
      background: '#1e1e1e',
      padding: '14px 18px',
      borderRadius: 8,
      overflow: 'auto',
      margin: '14px 0',
      lineHeight: 1.6,
      border: '1px solid #2a2a2a',
    }}
  >
    {children}
  </pre>
);

export const MarkdownPane: FC<Props> = ({ title, content }) => {
  const isMobile = useIsMobile();
  return (
    <div
      style={{
        padding: isMobile ? '24px 18px 56px' : '40px 56px 80px',
        maxWidth: 820,
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
        color: '#24292f',
        fontSize: 15,
        lineHeight: 1.7,
      }}
    >
      {title !== undefined && (
        <div
          style={{
            fontSize: 11,
            color: '#9ca3af',
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            marginBottom: 14,
            fontWeight: 600,
          }}
        >
          Documentation · {title}
        </div>
      )}
      <div className="md-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code: Code,
            pre: Pre,
            h1: ({ children }) => (
              <h1
                style={{
                  fontSize: 32,
                  fontWeight: 700,
                  marginTop: 0,
                  marginBottom: 24,
                  color: '#111827',
                  letterSpacing: -0.3,
                  borderBottom: '1px solid #e5e7eb',
                  paddingBottom: 12,
                }}
              >
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  marginTop: 40,
                  marginBottom: 12,
                  color: '#111827',
                  borderBottom: '1px solid #e5e7eb',
                  paddingBottom: 6,
                  letterSpacing: -0.2,
                }}
              >
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3
                style={{
                  fontSize: 17,
                  fontWeight: 600,
                  marginTop: 28,
                  marginBottom: 8,
                  color: '#1f2937',
                }}
              >
                {children}
              </h3>
            ),
            h4: ({ children }) => (
              <h4
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  marginTop: 22,
                  marginBottom: 6,
                  color: '#374151',
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                }}
              >
                {children}
              </h4>
            ),
            p: ({ children }) => (
              <p style={{ margin: '12px 0', color: '#24292f' }}>{children}</p>
            ),
            ul: ({ children }) => (
              <ul style={{ margin: '12px 0', paddingLeft: 26 }}>{children}</ul>
            ),
            ol: ({ children }) => (
              <ol style={{ margin: '12px 0', paddingLeft: 26 }}>{children}</ol>
            ),
            li: ({ children }) => <li style={{ margin: '6px 0' }}>{children}</li>,
            a: ({ children, href }) => (
              <a
                href={href}
                style={{
                  color: '#2563eb',
                  textDecoration: 'none',
                  borderBottom: '1px solid #c7d2fe',
                }}
                target="_blank"
                rel="noreferrer"
              >
                {children}
              </a>
            ),
            blockquote: ({ children }) => (
              <blockquote
                style={{
                  borderLeft: '3px solid #c7d2fe',
                  margin: '18px 0',
                  padding: '4px 18px',
                  color: '#4b5563',
                  background: '#f5f7ff',
                  borderRadius: '0 6px 6px 0',
                }}
              >
                {children}
              </blockquote>
            ),
            table: ({ children }) => (
              <div style={{ overflow: 'auto', margin: '18px 0' }}>
                <table
                  style={{
                    borderCollapse: 'collapse',
                    fontSize: 13,
                    width: '100%',
                  }}
                >
                  {children}
                </table>
              </div>
            ),
            th: ({ children }) => (
              <th
                style={{
                  textAlign: 'left',
                  padding: '10px 14px',
                  borderBottom: '2px solid #d1d5db',
                  background: '#f3f4f6',
                  fontWeight: 700,
                  color: '#111827',
                }}
              >
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td
                style={{
                  padding: '8px 14px',
                  borderBottom: '1px solid #e5e7eb',
                  color: '#24292f',
                }}
              >
                {children}
              </td>
            ),
            hr: () => (
              <hr
                style={{
                  border: 'none',
                  borderTop: '1px solid #e5e7eb',
                  margin: '32px 0',
                }}
              />
            ),
            strong: ({ children }) => (
              <strong style={{ fontWeight: 700, color: '#111827' }}>{children}</strong>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
};
