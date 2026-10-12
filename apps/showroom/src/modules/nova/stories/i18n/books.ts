import type { Phrasebook } from '@niscorp/nova/i18n';

export const GERMAN: Phrasebook = {
  'Front desk': 'Empfang',
  'Add a member': 'Mitglied hinzufügen',
  'Search people': 'Personen suchen',
  Save: 'Speichern',
  Cancel: 'Abbrechen',
  'Nobody here yet.': 'Noch niemand hier.',
  'Everyone the studio deals with.': 'Alle, mit denen das Studio zu tun hat.',
  Person: 'Name',
  Standing: 'Status',
  Plan: 'Tarif',
  Active: 'Aktiv',
  Paused: 'Pausiert',
  Trialling: 'Testphase',
  'Past member': 'Ehemalig',
  // Collides with a member's surname on purpose.
  Pass: 'Zehnerblock',
  Yes: 'Ja',
  No: 'Nein',
  '{n} of {total}': '{n} von {total}',
  '{n} left': 'noch {n}',
  'somebody joins': 'jemand beitritt',
  'When {moment}, {effect}': 'Wenn {moment}, {effect}',
  'email them': 'schreib ihnen',
  // 'Archive everything' is deliberately absent, so the harvest story has
  // something to report.
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

export const LOCALES: readonly { tag: string; label: string; book: Phrasebook | undefined }[] = [
  { tag: 'en', label: 'English', book: undefined },
  { tag: 'de', label: 'Deutsch', book: GERMAN },
  { tag: 'fr', label: 'Français', book: FRENCH },
];
