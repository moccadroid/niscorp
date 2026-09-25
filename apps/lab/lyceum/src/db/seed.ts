// What exists before anybody walks in: the houses and the two principals that
// are not people. Everything else is written by the room.
//
// The houses are provisional (PLAN.md, Open). Each house_id is also a charter
// role — sorting a person into a house IS giving them that role — and
// `sorting-check` asserts the two lists agree.

type House = { houseId: string; name: string; character: string; colour: string };

export const HOUSES: readonly House[] = [
  { houseId: 'ravens', name: 'Ravens', character: 'The curious: they ask the question behind the question and follow it wherever it goes.', colour: '#3b4a8c' },
  { houseId: 'owls', name: 'Owls', character: 'The careful: they read the whole thing first and trust what they can check.', colour: '#8c6d3b' },
  { houseId: 'foxes', name: 'Foxes', character: 'The quick: they try it before they are told how, and learn from what breaks.', colour: '#a4462c' },
  { houseId: 'stags', name: 'Stags', character: 'The steadfast: they build the thing that is still standing next year.', colour: '#2f6b4f' },
];

// The two principals that are not people, and the role each wears. Their
// sessions are minted by whoever runs the talk (dev: /dev/as/<principal>).
export const STAFF: readonly { principal: string; role: string }[] = [
  { principal: 'speaker', role: 'speaker' },
  { principal: 'stage', role: 'stage' },
];

const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

export const buildSeedSql = (): string =>
  [
    ...HOUSES.map(
      (house, position) =>
        `INSERT INTO houses (house_id, name, character, colour, position) VALUES (${quote(house.houseId)}, ${quote(house.name)}, ${quote(house.character)}, ${quote(house.colour)}, ${position});`,
    ),
    ...STAFF.map((staff) => `INSERT INTO grants (principal, role) VALUES (${quote(staff.principal)}, ${quote(staff.role)});`),
  ].join('\n');
