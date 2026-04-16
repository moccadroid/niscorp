import { useMemo, type FC } from 'react';
import type { ToolDefinition } from '@niscorp/cortex';
import type { Story } from '@showroom/modules/types';
import { CodeView } from '@showroom/chrome/code-view';
import { extractCalls } from './extract-blocks';

// ═══════════════════════════════════════════════════════════
// Tools tab — for each tool the story uses, show its
// `defineTool({...})` source extracted from the agent file.
//
// Tools are co-located with their agent (in agents/<name>.agent.ts).
// We scan `story.agentSource` for every `defineTool({...})` call,
// read each block's `id: '...'` field, and match to the runtime
// tool by `tool.config.id`. This is robust to variable renames
// (`dbTool` vs `queryDbTool` etc.) because we key off the id the
// tool actually carries at runtime.
// ═══════════════════════════════════════════════════════════

const ToolBlock: FC<{ tool: ToolDefinition; blockSource: string | undefined }> = ({
  tool,
  blockSource,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column' }}>
    <div
      style={{
        padding: '10px 14px',
        background: '#f9fafb',
        borderBottom: '1px solid #e5e7eb',
        fontSize: 12,
        color: '#1f2937',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div>
        <strong>{tool.config.name}</strong>{' '}
        <span style={{ color: '#6b7280' }}>
          · id: {tool.config.id} · risk: {tool.config.riskLevel ?? 'unknown'}
        </span>
      </div>
      <div style={{ color: '#6b7280', fontSize: 11 }}>{tool.config.description}</div>
    </div>
    <CodeView
      legend={`defineTool({...}) for ${tool.config.name}`}
      source={blockSource ?? `// Source for id="${tool.config.id}" not found in the agent file.`}
    />
  </div>
);

export const ToolsTab: FC<{ story: Story }> = ({ story }) => {
  const tools = (story['tools'] as ReadonlyArray<ToolDefinition> | undefined) ?? [];
  const agentSource = typeof story['agentSource'] === 'string' ? story['agentSource'] : undefined;

  const blocksById = useMemo((): Map<string, string> => {
    const map = new Map<string, string>();
    if (agentSource === undefined) return map;
    for (const block of extractCalls(agentSource, 'defineTool')) {
      if (block.id !== undefined) map.set(block.id, block.source);
    }
    return map;
  }, [agentSource]);

  if (tools.length === 0) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: '#9ca3af' }}>
        This story doesn't register any tools.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 0' }}>
      {tools.map((tool) => (
        <ToolBlock key={tool.config.id} tool={tool} blockSource={blocksById.get(tool.config.id)} />
      ))}
    </div>
  );
};
