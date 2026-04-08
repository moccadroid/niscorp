import { useMemo, useState, type FC } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';

// ═══════════════════════════════════════════════════════════
// CodeView — reusable syntax-highlighted TypeScript pane with
// a Copy button. Used by every library's Snippet tab.
// Library-agnostic; lives in chrome/.
// ═══════════════════════════════════════════════════════════

type Props = {
  legend: string;
  source: string;
};

export const CodeView: FC<Props> = ({ legend, source }) => {
  const [copied, setCopied] = useState(false);

  const highlighted = useMemo((): string => {
    const grammar = Prism.languages['typescript'] ?? Prism.languages['javascript'];
    if (grammar === undefined) return source;
    return Prism.highlight(source, grammar, 'typescript');
  }, [source]);

  const copy = (): void => {
    void navigator.clipboard.writeText(source).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: '12px 16px',
          background: '#f3f4f6',
          color: '#4b5563',
          fontSize: 11,
          borderBottom: '1px solid #e5e7eb',
          fontStyle: 'italic',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <span>{legend}</span>
        <button
          type="button"
          onClick={copy}
          style={{
            fontSize: 11,
            padding: '4px 10px',
            border: '1px solid #d1d5db',
            background: copied ? '#dcfce7' : '#ffffff',
            color: copied ? '#166534' : '#1f2937',
            borderRadius: 4,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', background: '#1e1e1e' }}>
        <pre
          style={{
            margin: 0,
            padding: 16,
            fontSize: 11,
            fontFamily: 'ui-monospace, Menlo, monospace',
            whiteSpace: 'pre',
            color: '#d4d4d4',
          }}
        >
          <code
            className="language-typescript"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </pre>
      </div>
    </div>
  );
};
