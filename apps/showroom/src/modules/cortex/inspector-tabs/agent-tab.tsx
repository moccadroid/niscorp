import type { FC } from 'react';
import type { AgentDefinition } from '@niscorp/cortex';
import type { Story } from '@showroom/modules/types';
import { CodeView } from '@showroom/chrome/code-view';

// ═══════════════════════════════════════════════════════════
// Agent tab — shows the actual `defineAgent({...})` source code
// for the agent driving this story. The demo file imports the
// agent's .agent.ts via Vite ?raw and re-exports it as
// `agentSource`; we display that text verbatim.
//
// This is the lesson: how to write a Cortex agent. The metadata
// (id, output mode, instructions) is all visible in the source —
// no need to parse it out into separate fields.
// ═══════════════════════════════════════════════════════════

const LEGEND = "The agent file's source — the defineAgent({...}) call this story uses.";

const MISSING =
  '// This story does not expose `agentSource`. The mapping agent\n' +
  '// (used by Prism-mapping demos) lives in @niscorp/prism/agent\n' +
  '// and is not bundled with the showroom as a raw import.';

export const AgentTab: FC<{ story: Story }> = ({ story }) => {
  const agentSource = typeof story['agentSource'] === 'string' ? story['agentSource'] : undefined;
  const agent = story['agent'] as AgentDefinition<unknown> | undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {agent !== undefined && (
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
            <strong>{agent.config.id}</strong>{' '}
            <span style={{ color: '#6b7280' }}>· outputMode: {agent.config.outputMode}</span>
          </div>
          <div style={{ color: '#6b7280', fontSize: 11 }}>{agent.config.description}</div>
        </div>
      )}
      <CodeView legend={LEGEND} source={agentSource ?? MISSING} />
    </div>
  );
};
