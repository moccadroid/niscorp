import { useMemo, useState, type FC } from 'react';
import { z } from 'zod';
import type { NovaStory } from '../story-types';
import { getStoryRegistry } from './story-registry';

// ═══════════════════════════════════════════════════════════
// Registry tab — collapsible list of components. Each row shows
// the component name + a builtin/custom tag. Expanding a row
// reveals the prop list (name, type, required, description)
// extracted from the component's Zod propsSchema via toJSONSchema.
// ═══════════════════════════════════════════════════════════

const BUILTINS = new Set<string>([
  'Stack',
  'Text',
  'Input',
  'Button',
  'Box',
  'CanvasSlot',
  'ActionSlot',
]);

type JsonSchemaLike = {
  type?: string | string[];
  properties?: Record<string, JsonSchemaLike>;
  required?: string[];
  description?: string;
  enum?: unknown[];
  items?: JsonSchemaLike;
  anyOf?: JsonSchemaLike[];
  oneOf?: JsonSchemaLike[];
};

type PropInfo = {
  name: string;
  type: string;
  required: boolean;
  description?: string;
};

const summariseType = (schema: JsonSchemaLike): string => {
  if (schema.enum !== undefined && Array.isArray(schema.enum)) {
    return schema.enum.map((v) => (typeof v === 'string' ? `'${v}'` : String(v))).join(' | ');
  }
  if (schema.anyOf !== undefined) {
    return schema.anyOf.map(summariseType).join(' | ');
  }
  if (schema.oneOf !== undefined) {
    return schema.oneOf.map(summariseType).join(' | ');
  }
  if (schema.type === 'array' && schema.items !== undefined) {
    return `${summariseType(schema.items)}[]`;
  }
  if (Array.isArray(schema.type)) return schema.type.join(' | ');
  return schema.type ?? 'unknown';
};

const extractProps = (propsSchema: z.ZodTypeAny | undefined): PropInfo[] => {
  if (propsSchema === undefined) return [];
  let jsonSchema: JsonSchemaLike;
  try {
    jsonSchema = z.toJSONSchema(propsSchema) as JsonSchemaLike;
  } catch {
    return [];
  }
  const props = jsonSchema.properties ?? {};
  const required = new Set(jsonSchema.required ?? []);
  return Object.entries(props).map(([name, sub]) => ({
    name,
    type: summariseType(sub),
    required: required.has(name),
    description: sub.description,
  }));
};

const Chevron: FC<{ open: boolean }> = ({ open }) => (
  <span style={{ color: '#9ca3af', fontSize: 9, width: 12, display: 'inline-block', userSelect: 'none' }}>
    {open ? '▾' : '▸'}
  </span>
);

const Tag: FC<{ builtin: boolean }> = ({ builtin }) => (
  <span
    style={{
      fontSize: 10,
      padding: '1px 6px',
      borderRadius: 3,
      color: builtin ? '#1e40af' : '#6b21a8',
      background: builtin ? '#dbeafe' : '#f3e8ff',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      fontWeight: 600,
    }}
  >
    {builtin ? 'builtin' : 'custom'}
  </span>
);

const PropRow: FC<{ info: PropInfo }> = ({ info }) => (
  <div
    style={{
      display: 'flex',
      gap: 8,
      padding: '4px 0',
      fontFamily: 'ui-monospace, Menlo, monospace',
      fontSize: 11,
      alignItems: 'baseline',
    }}
  >
    <span style={{ color: '#111827', fontWeight: 600, minWidth: 80 }}>
      {info.name}
      {info.required ? '' : <span style={{ color: '#9ca3af', fontWeight: 400 }}>?</span>}
    </span>
    <span style={{ color: '#7c2d12' }}>{info.type}</span>
    {info.description !== undefined && (
      <span style={{ color: '#6b7280', fontFamily: 'system-ui, sans-serif', fontSize: 11 }}>
        {info.description}
      </span>
    )}
  </div>
);

const ComponentRow: FC<{ name: string; meta: { description?: string; propsSchema?: z.ZodTypeAny } | undefined }> = ({
  name,
  meta,
}) => {
  const [open, setOpen] = useState<boolean>(false);
  const props = useMemo(() => extractProps(meta?.propsSchema), [meta]);
  const builtin = BUILTINS.has(name);
  const hasDetail = props.length > 0 || (meta?.description !== undefined);

  return (
    <li
      style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => hasDetail && setOpen(!open)}
        disabled={!hasDetail}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: '6px 8px',
          background: 'transparent',
          border: 'none',
          cursor: hasDetail ? 'pointer' : 'default',
          fontSize: 12,
          fontFamily: 'ui-monospace, Menlo, monospace',
          textAlign: 'left',
        }}
      >
        {hasDetail ? <Chevron open={open} /> : <span style={{ width: 12, display: 'inline-block' }} />}
        <span style={{ fontWeight: 600, color: '#111827', flex: 1 }}>{name}</span>
        <Tag builtin={builtin} />
      </button>
      {open && hasDetail && (
        <div
          style={{
            padding: '6px 12px 10px 34px',
            borderTop: '1px solid #f3f4f6',
            background: '#fafafa',
          }}
        >
          {meta?.description !== undefined && (
            <div
              style={{
                fontSize: 11,
                color: '#374151',
                marginBottom: 8,
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              {meta.description}
            </div>
          )}
          {props.length === 0 ? (
            <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>(no props)</div>
          ) : (
            props.map((p) => <PropRow key={p.name} info={p} />)
          )}
        </div>
      )}
    </li>
  );
};

export const RegistryTab: FC<{ story: NovaStory }> = ({ story }) => {
  const registry = useMemo(() => getStoryRegistry(story), [story]);
  const names = registry.list();
  return (
    <div style={{ padding: 12 }}>
      <div
        style={{
          fontSize: 11,
          color: '#6b7280',
          marginBottom: 8,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {names.length} component{names.length === 1 ? '' : 's'} registered
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {names.map((name) => {
          const entry = registry.get(name);
          return <ComponentRow key={name} name={name} meta={entry?.meta} />;
        })}
      </ul>
    </div>
  );
};
