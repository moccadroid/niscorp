// The wall-clock date as YYYY-MM-DD — the `$.today` ambient value and the
// checks' date anchor (the seed generates relative to the same day).
export const todayStr = (): string => new Date().toISOString().slice(0, 10);
