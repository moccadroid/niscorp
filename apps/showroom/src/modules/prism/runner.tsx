import { useMemo, type FC, type ReactNode } from 'react';
import { ConfigSchema, evaluateSafe, type JsonObject } from '@niscorp/prism';
import { isPrismStory } from './story-types';

// ═══════════════════════════════════════════════════════════
// Runner — synchronously runs `evaluate(config, input)` once
// per story (memoized) and renders the input + config + output
// side by side in the canvas pane. The inspector tabs read the
// story directly, so there is no live runtime context.
// ═══════════════════════════════════════════════════════════

type Props = { story: unknown };

type Computed =
  | { ok: true; output: unknown }
  | { ok: false; error: string };

// Bridge `unknown` to prism's typed `Config` via ConfigSchema.safeParse.
// Zod's safeParse narrows `parsed.data` to the inferred `Config` type, so
// no cast is required at this boundary.
const computeStory = (config: unknown, input: JsonObject): Computed => {
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
}) => {
  return (
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
};

export const Runner: FC<Props> = ({ story }) => {
  const computed = useMemo<Computed | undefined>(() => {
    if (!isPrismStory(story)) return undefined;
    return computeStory(story.config, story.input);
  }, [story]);

  if (!isPrismStory(story)) {
    return <div style={{ padding: 24, color: '#9ca3af' }}>Not a prism story.</div>;
  }
  if (computed === undefined) return null;

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Section title="Input" body={JSON.stringify(story.input, null, 2)} />
      <Section title="Config" body={JSON.stringify(story.config, null, 2)} />
      {computed.ok ? (
        <Section title="Output" body={JSON.stringify(computed.output, null, 2)} />
      ) : (
        <Section title="Error" body={computed.error} variant="error" />
      )}
    </div>
  );
};
