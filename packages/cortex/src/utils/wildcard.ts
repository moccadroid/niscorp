// ═══════════════════════════════════════════════════════════
// Topic pattern matching — supports * and # wildcards
// ═══════════════════════════════════════════════════════════
//
// Patterns are dot-separated. Wildcards:
//   *  — matches exactly one segment
//   #  — matches zero or more segments (must be the last segment)
//
// Examples:
//   "agent.completed"        matches "agent.completed"
//   "agent.*"                matches "agent.completed", "agent.failed"
//   "cortex.#"               matches "cortex.workflow.started", "cortex.tool.observed"
//   "cortex.tool.observed"   matches itself
//
// We compile patterns to a regex once on subscribe — matching is then O(string length).

export const compileTopicPattern = (pattern: string): RegExp => {
  if (pattern.length === 0) return /^$/;
  const segments = pattern.split('.');
  const parts: string[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (seg === undefined) continue;
    const isLast = i === segments.length - 1;
    if (seg === '#') {
      if (!isLast) {
        // # may only appear as the final segment — anywhere else is a user error.
        // We treat it as a literal in that case so the pattern is still defined.
        parts.push('#');
        continue;
      }
      parts.push('.*');
      return new RegExp(`^${parts.join('\\.')}$`.replace(/\\\.\.\*/g, '(?:\\..*)?'));
    }
    if (seg === '*') {
      parts.push('[^.]+');
      continue;
    }
    parts.push(seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  }
  return new RegExp(`^${parts.join('\\.')}$`);
};

export const matchesTopic = (pattern: string, topic: string): boolean =>
  compileTopicPattern(pattern).test(topic);
