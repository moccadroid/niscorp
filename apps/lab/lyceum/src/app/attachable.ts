// WHERE AN INTEGRATION'S SCREENS MAY GO — lyceum's half of the placement
// contract (moss `attachable`). An integration's bundle says which of its
// actions rides which of these (`attachments`); intake refuses one that names
// anything else. Each seat offers nothing to its riders: no keys.
//
//   member.phone     the phone's list — a block among the person's actions
//   speaker.console  the controller — a region of its own, on every slide
//   slide.end        the last slide — on the projector
//
// Which canvas a seat's riders land on is the server's (server/attached.ts).
export const ATTACHABLE: Record<string, Record<string, string>> = {
  'member.phone': {},
  'speaker.console': {},
  'slide.end': {},
};
