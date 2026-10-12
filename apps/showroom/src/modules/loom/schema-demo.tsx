import { useState, type FC } from 'react';
import type { ZodType } from 'zod';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { LoomEditor } from '@niscorp/loom/react';
import { Code } from '@showroom/chrome/stage/ui';
import { DemoPanel } from './demo-panel';

export const SchemaDemo: FC<{ schema: ZodType; value?: unknown; components?: Record<string, NovaComponent> }> = ({ schema, value, components }) => {
  const [data, setData] = useState<unknown>(value ?? {});
  return (
    <DemoPanel
      form={
        <LoomEditor
          plugins={[{ name: 'demo', documents: { value: schema }, ...(components ? { components } : {}) }]}
          artifact={{ type: 'demo', ...(value !== undefined ? { documents: { value } } : {}) }}
          onChange={(docs) => setData(docs['value'])}
        />
      }
      output={<Code maxHeight={520}>{JSON.stringify(data, null, 2) ?? 'undefined'}</Code>}
    />
  );
};
