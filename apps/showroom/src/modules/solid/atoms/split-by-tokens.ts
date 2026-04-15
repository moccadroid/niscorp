// Simulates how a real LLM stream arrives — chunks mostly land on
// JSON structural boundaries. In production replace this with
// your actual event source (signal.stream, server-sent events,
// etc.) and feed the chunks into stream.write().

export const splitByTokens = (json: string): string[] => {
  const out: string[] = [];
  let buf = '';
  for (let i = 0; i < json.length; i += 1) {
    const ch = json[i] as string;
    buf += ch;
    const structural = ch === '{' || ch === '}' || ch === '[' || ch === ']' || ch === ',' || ch === ':';
    const stringEnd = ch === '"' && i > 0 && json[i - 1] !== '\\';
    if (structural || stringEnd) {
      out.push(buf);
      buf = '';
    }
  }
  if (buf.length > 0) out.push(buf);
  return out;
};
