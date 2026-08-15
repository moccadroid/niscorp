import type { Phrasebook } from '@niscorp/nova/i18n';

// ═══════════════════════════════════════════════════════════
// THE BOOKS, AS A FILE.
//
// Lyra keeps these in Postgres — a `phrases (locale, source, text)` table read
// over each session's own wire, because a studio changes its own language at
// runtime and integrations ship books of their own. Showroom keeps them here, in
// source, because nothing about that is nova's business: a `Phrasebook` is
// `Record<string, string>`, and where it came from is the host's problem.
//
// That contrast IS the demonstration. Same renderer, same swap, same rules —
// one book arrives from rows, one from an import.
// ═══════════════════════════════════════════════════════════

export const GERMAN: Phrasebook = {
  // chrome
  'Front desk': 'Empfang',
  'Add a member': 'Mitglied hinzufügen',
  'Search people': 'Personen suchen',
  Save: 'Speichern',
  Cancel: 'Abbrechen',
  'Nobody here yet.': 'Noch niemand hier.',
  'Everyone the studio deals with.': 'Alle, mit denen das Studio zu tun hat.',
  // table headers
  Person: 'Name',
  Standing: 'Status',
  Plan: 'Tarif',
  // closed-set words a read manufactures
  Active: 'Aktiv',
  Paused: 'Pausiert',
  Trialling: 'Testphase',
  'Past member': 'Ehemalig',
  // the product a studio sells — collides with a member's surname on purpose
  Pass: 'Zehnerblock',
  // options
  Yes: 'Ja',
  No: 'Nein',
  // counted phrases: the PATTERN is the dictionary row, not the sentence
  '{n} of {total}': '{n} von {total}',
  '{n} left': 'noch {n}',
  'somebody joins': 'jemand beitritt',
  'When {moment}, {effect}': 'Wenn {moment}, {effect}',
  'email them': 'schreib ihnen',
  // deliberately absent, so the harvest story has something to report:
  //   'Archive everything'
};

export const FRENCH: Phrasebook = {
  'Front desk': 'Accueil',
  'Add a member': 'Ajouter un membre',
  'Search people': 'Rechercher des personnes',
  Save: 'Enregistrer',
  Cancel: 'Annuler',
  'Nobody here yet.': 'Personne pour le moment.',
  'Everyone the studio deals with.': 'Toutes les personnes du studio.',
  Person: 'Nom',
  Standing: 'Statut',
  Plan: 'Formule',
  Active: 'Actif',
  Paused: 'En pause',
  Trialling: 'Essai',
  'Past member': 'Ancien membre',
  Pass: 'Carnet',
  Yes: 'Oui',
  No: 'Non',
  '{n} of {total}': '{n} sur {total}',
  '{n} left': 'il en reste {n}',
  'somebody joins': "quelqu'un s'inscrit",
  'When {moment}, {effect}': 'Quand {moment}, {effect}',
  'email them': 'écris-leur',
};

/** The offer a switcher makes. The SOURCE language has no book, by
 *  construction — nothing about it needs translating — so it is named here
 *  rather than derived from the books, exactly as a deployment has to name it. */
export const LOCALES: readonly { tag: string; label: string; book: Phrasebook | undefined }[] = [
  { tag: 'en', label: 'English', book: undefined },
  { tag: 'de', label: 'Deutsch', book: GERMAN },
  { tag: 'fr', label: 'Français', book: FRENCH },
];
