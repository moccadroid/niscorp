import { useMemo, type FC, type ReactNode } from 'react';
import { ConfigSchema, evaluateSafe, type JsonObject } from '@niscorp/prism';

// ═══════════════════════════════════════════════════════════
// PrismView — showroom render helper for Prism transform demos.
//
// Takes input + config, parses the config against the public
// ConfigSchema, runs evaluateSafe, and renders three stacked
// panels: Input, Config, Output (or Error).
//
// Scoped to the showroom. Prism the library has no reason to
// ship a React helper — this UI exists only to visualise a
// transform for humans.
// ═══════════════════════════════════════════════════════════

type Props = {
  input: JsonObject;
  config: unknown;
};

type Computed =
  | { ok: true; output: unknown }
  | { ok: false; error: string };

const compute = (config: unknown, input: JsonObject): Computed => {
  const parsed = ConfigSchema.safeParse(config);
  if (!parsed.success) {
    return { ok: false, error: `Invalid prism config: ${parsed.error.message}` };
  }
  const result = evaluateSafe(parsed.data, input);
  if (result.ok) return { ok: true, output: result.data };
  return { ok: false, error: result.error.message };
};

const Section: FC<{ title: string; body: ReactNode; variant?: 'normal' | 'error' }> = ({
  title,
  body,
  variant = 'normal',
}) => (
  <div>
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: '#6b7280',
        marginBottom: 6,
      }}
    >
      {title}
    </div>
    <pre
      style={{
        margin: 0,
        padding: 12,
        background: variant === 'error' ? '#fef2f2' : '#f9fafb',
        color: variant === 'error' ? '#991b1b' : '#1f2937',
        border: `1px solid ${variant === 'error' ? '#fecaca' : '#e5e7eb'}`,
        borderRadius: 6,
        fontSize: 12,
        fontFamily: 'ui-monospace, Menlo, monospace',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        overflow: 'auto',
        maxHeight: 320,
      }}
    >
      {body}
    </pre>
  </div>
);

export const PrismView: FC<Props> = ({ input, config }) => {
  const computed = useMemo(() => compute(config, input), [config, input]);
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Section title="Input" body={JSON.stringify(input, null, 2)} />
      <Section title="Config" body={JSON.stringify(config, null, 2)} />
      {computed.ok ? (
        <Section title="Output" body={JSON.stringify(computed.output, null, 2)} />
      ) : (
        <Section title="Error" body={computed.error} variant="error" />
      )}
    </div>
  );
};
