export type Phrasebook = Readonly<Record<string, string>>;

export const greetingFrom = (book: Phrasebook, name: string, at: Date): string => {
  const hour = at.getHours();
  const stem = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = name.split(' ')[0] ?? name;
  return `${book[stem] ?? stem}, ${first}`;
};
