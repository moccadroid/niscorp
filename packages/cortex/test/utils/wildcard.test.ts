import { describe, expect, it } from 'vitest';
import { matchesTopic } from '../../src/utils/wildcard';

describe('matchesTopic', () => {
  it('matches exact topics', () => {
    expect(matchesTopic('agent.completed', 'agent.completed')).toBe(true);
    expect(matchesTopic('agent.completed', 'agent.failed')).toBe(false);
  });

  it('matches single-segment wildcard *', () => {
    expect(matchesTopic('agent.*', 'agent.completed')).toBe(true);
    expect(matchesTopic('agent.*', 'agent.tool.observed')).toBe(false);
    expect(matchesTopic('*.completed', 'agent.completed')).toBe(true);
  });

  it('matches multi-segment wildcard #', () => {
    expect(matchesTopic('cortex.#', 'cortex.workflow.started')).toBe(true);
    expect(matchesTopic('cortex.#', 'cortex.tool.observed')).toBe(true);
    expect(matchesTopic('cortex.#', 'cortex')).toBe(true);
    expect(matchesTopic('cortex.#', 'other.topic')).toBe(false);
  });

  it('matches the global # pattern', () => {
    expect(matchesTopic('#', 'anything.at.all')).toBe(true);
    expect(matchesTopic('#', '')).toBe(true);
  });

  it('escapes regex metacharacters in literal segments', () => {
    expect(matchesTopic('a.b', 'aXb')).toBe(false);
    expect(matchesTopic('a.b', 'a.b')).toBe(true);
  });
});
