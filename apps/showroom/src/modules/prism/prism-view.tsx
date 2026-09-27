import { useMemo, type FC } from 'react';
import { ConfigSchema, evaluateSafe, type JsonObject } from '@niscorp/prism';
import { Chip, Grid, INK, Panel } from '@showroom/chrome/stage/ui';
import { Block, json, opsOf, shapeOf } from './parts';

// ═══════════════════════════════════════════════════════════
// PrismView — the canvas every Prism transform story renders through.
//
// Takes input + config, parses the config against the public ConfigSchema,
// runs evaluateSafe, and lays the three out left to right: what comes in, the
// config, what comes out (or why it was refused). All of it is the real
// package, evaluated in this page on every render.
//
// Scoped to the showroom. Prism the library has no reason to ship a React
// helper — this UI exists only to visualise a transform for humans.
// ═══════════════════════════════════════════════════════════

type Props = {
  input: JsonObject;
  config: unknown;
};

type Computed =
  | { ok: true; output: unknown }
  | { ok: false; stage: 'parse' | 'evaluate'; error: string };

const compute = (config: unknown, input: JsonObject): Computed => {
  const parsed = ConfigSchema.safeParse(config);
  if (!parsed.success) {
    return { ok: false, stage: 'parse', error: `Invalid prism config: ${parsed.error.message}` };
  }
  const result = evaluateSafe(parsed.data, input);
  if (result.ok) return { ok: true, output: result.data };
  return { ok: false, stage: 'evaluate', error: result.error.message };
};

const Arrow: FC = () => (
  <span aria-hidden style={{ color: INK.faint }}>
    →
  </span>
);

export const PrismView: FC<Props> = ({ input, config }) => {
  const computed = useMemo(() => compute(config, input), [config, input]);
  const ops = useMemo(() => opsOf(config), [config]);
  return (
    <div style={{ padding: '20px 24px 40px', display: 'flex', flexDirection: 'column', gap: 14, color: INK.text }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 13, color: INK.soft }}>
        <span>Data in</span>
        <Arrow />
        <span>a config, as JSON</span>
        <Arrow />
        <span>data out.</span>
        <span style={{ marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ops.map((op) => (
            <Chip key={op} tone="accent" mono>
              {op}
            </Chip>
          ))}
        </span>
      </div>
      <Grid min={280} gap={14}>
        <Panel title="What comes in" aside={shapeOf(input)}>
          <Block>{json(input)}</Block>
        </Panel>
        <Panel title="The Prism config" aside={`${ops.length} operator${ops.length === 1 ? '' : 's'}`}>
          <Block>{json(config)}</Block>
        </Panel>
        {computed.ok ? (
          <Panel title="What comes out" tone="ok" aside={<Chip tone="ok">{shapeOf(computed.output)}</Chip>}>
            <Block tone="ok">{json(computed.output)}</Block>
          </Panel>
        ) : (
          <Panel title={computed.stage === 'parse' ? 'Refused — not a valid config' : 'Refused while evaluating'} tone="bad" aside={<Chip tone="bad">no output</Chip>}>
            <Block tone="bad">{computed.error}</Block>
          </Panel>
        )}
      </Grid>
    </div>
  );
};
