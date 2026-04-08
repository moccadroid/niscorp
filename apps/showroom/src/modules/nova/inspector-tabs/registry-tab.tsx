import { useMemo, type CSSProperties, type FC } from 'react';

const LEGEND_STYLE: CSSProperties = {
  padding: '12px 16px',
  background: '#f3f4f6',
  color: '#4b5563',
  fontSize: 11,
  borderBottom: '1px solid #e5e7eb',
  fontStyle: 'italic',
};
import type { z } from 'zod';
import { createComponentRegistry } from '@niscorp/nova';
import { registerNovaReactComponents } from '@niscorp/nova/components/react';
import type { NovaComponent } from '@niscorp/nova/react';

const isShapeBearing = (
  value: unknown,
): value is { shape: Record<string, unknown> } => {
  if (typeof value !== 'object' || value === null) return false;
  if (!('shape' in value)) return false;
  const shape: unknown = Reflect.get(value, 'shape');
  return typeof shape === 'object' && shape !== null;
};

const describeShape = (schema: z.ZodTypeAny | undefined): string[] => {
  if (schema === undefined) return [];
  if (!isShapeBearing(schema)) return [];
  return Object.keys(schema.shape);
};

export const RegistryTab: FC = () => {
  const entries = useMemo(() => {
    const registry = createComponentRegistry<NovaComponent>();
    registerNovaReactComponents(registry);
    return registry.list().map((name) => {
      const entry = registry.get(name);
      return {
        name,
        description: entry?.meta.description ?? '',
        fields: describeShape(entry?.meta.propsSchema),
      };
    });
  }, []);

  return (
    <div>
      <div style={LEGEND_STYLE}>
        Components currently registered for this story. Each lists its description and propsSchema
        fields.
      </div>
      <div style={{ padding: 16, fontSize: 12 }}>
      {entries.map((e) => (
        <div key={e.name} style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{e.name}</div>
          <div style={{ color: '#6b7280', marginBottom: 4 }}>{e.description}</div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontFamily: 'ui-monospace, Menlo, monospace',
              fontSize: 11,
            }}
          >
            {e.fields.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      ))}
      </div>
    </div>
  );
};
