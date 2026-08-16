// ═══════════════════════════════════════════════════════════════
// DEUTSCH — the litmus test.
//
// Keyed on the English source phrase, which is what `@niscorp/nova/i18n`
// harvests from the layouts and swaps on the way out. Regenerate the list of
// what is still missing with:
//
//   pnpm --filter lyra exec tsx src/dev/phrase-harvest.ts de
//
// Keyed `de`, and there is no `de-AT` to be keyed on: this application offers
// one German, not one per country. What is not in here is money and dates —
// `Intl` derives those from the same tag (`prisms/format.prism.ts`).
//
// REGISTER: du, not Sie. The English voice is plain and warm ("Nobody here
// yet.", "Quiet day.") and Sie would make it stiff in a way the original is
// not. It is also what studios in the German-speaking world actually use.
//
// GLOSSARY — decided once, so three screens cannot describe one thing three
// ways (the same rule `standing.ts` states for the English vocabulary):
//   Class          Kurs            (one slot that repeats weekly)
//   Class type     Kursart         (Vinyasa, Fundamentals — no times)
//   Course         Kursblock       (bounded, between two dates, one price)
//   Timetable      Stundenplan     (every dated class)
//   Plan           Tarif           (a recurring membership)
//   Pass           Blockkarte      (classes bought up front)
//   The roll       Kartei          (everyone the studio knows)
//   Staff          Team
//   Front desk     Empfang
//   Instructor     Trainer   / "Taught by" → Kursleitung
//   Standing       Status
// ═══════════════════════════════════════════════════════════════

export const GERMAN: Record<string, string> = {
  // ── copy, long form ──
  'A block with an end date and a price. Joined once, and the seat is held for the whole run.':
    'Ein Block mit Enddatum und Preis. Einmal beigetreten, ist der Platz für den ganzen Zeitraum reserviert.',
  'A member joins from their own Booking screen, or the desk enrols them.':
    'Mitglieder treten über ihren eigenen Buchen-Bereich bei, oder der Empfang trägt sie ein.',
  'A month': 'Ein Monat',
  'A pass — classes bought up front': 'Eine Blockkarte — Kurse im Voraus gekauft',
  'A plan — billed on repeat': 'Ein Tarif — wiederkehrend abgerechnet',
  'A recipe fills the form in for you — it does not switch anything on. You read the words, change what you want, and save. Nothing goes out until you do.':
    'Eine Vorlage füllt das Formular für dich aus — sie schaltet nichts ein. Du liest den Text, änderst, was du willst, und speicherst. Vorher geht nichts raus.',
  'A token, not a hex — so it follows the studio’s theme instead of fighting it.':
    'Ein Token, kein Hex-Wert — so folgt es dem Erscheinungsbild des Studios, statt dagegen zu arbeiten.',
  'A weekly slot that repeats forever. The calendar fills itself in from it.':
    'Ein wöchentlicher Termin, der sich unbegrenzt wiederholt. Der Kalender füllt sich daraus von selbst.',
  'A workshop, a masterclass, a Saturday intensive — one date, and no weekly rule behind it.':
    'Ein Workshop, eine Masterclass, ein Samstagsintensiv — ein Termin, ohne wöchentliche Regel dahinter.',
  'A year': 'Ein Jahr',

  // ── actions ──
  Active: 'Aktiv',
  Add: 'Hinzufügen',
  'Add a class': 'Kurs anlegen',
  'Add a class type': 'Kursart anlegen',
  'Add a course': 'Kursblock anlegen',
  'Add a one-off': 'Einzeltermin anlegen',
  'Add a person': 'Person hinzufügen',
  'Add an automation': 'Automatisierung anlegen',
  'Add class': 'Kurs anlegen',
  'Add class type': 'Kursart anlegen',
  'Add course': 'Kursblock anlegen',
  'Add it': 'Hinzufügen',
  'Add plan': 'Tarif anlegen',
  'Add somebody': 'Jemanden hinzufügen',
  'Add the first weekly slot and the calendar fills itself.':
    'Leg den ersten wöchentlichen Termin an, und der Kalender füllt sich von selbst.',
  'Add them': 'Hinzufügen',
  'Add to staff': 'Zum Team hinzufügen',
  'Add to the price list': 'Zur Preisliste hinzufügen',
  'Add-ons': 'Add-ons',
  'Add-ons appear here once an operator has approved them for this deployment.':
    'Add-ons erscheinen hier, sobald ein Betreiber sie für diese Installation freigegeben hat.',
  'Added — see My classes. A full class puts you on the waiting list.':
    'Gebucht — siehe Meine Kurse. Bei einem vollen Kurs kommst du auf die Warteliste.',
  'Added. They can sign in with that address now.':
    'Angelegt. Ab sofort ist die Anmeldung mit dieser Adresse möglich.',
  Amber: 'Bernstein',
  'An add-on that has something to tell you — a belt awarded, a payment failed — puts it here.':
    'Ein Add-on, das dir etwas mitzuteilen hat — ein verliehener Gürtel, eine fehlgeschlagene Zahlung — legt es hier ab.',
  'An automation with an email effect puts its messages here.':
    'Eine Automatisierung mit E-Mail-Effekt legt ihre Nachrichten hier ab.',
  'Anything the desk should know.': 'Alles, was der Empfang wissen sollte.',
  'Anything you book will show up here.': 'Alles, was du buchst, erscheint hier.',
  Appearance: 'Erscheinungsbild',
  'Applies to everyone here, and changes how dates and prices are written.':
    'Gilt für alle hier und ändert, wie Datum und Preise geschrieben werden.',
  Apply: 'Anwenden',
  'Are you sure?': 'Bist du sicher?',
  Arm: 'Aktivieren',
  'Armed.': 'Aktiviert.',
  Arrived: 'Anwesend',
  'Ask at the desk about joining.': 'Frag am Empfang nach einer Anmeldung.',
  'At the desk': 'Am Empfang',
  'Attendance grouped on the week each class was written into.':
    'Teilnahmen, gruppiert nach der Woche, in der der Kurs stattfand.',
  'Attendance, the roll by status, and which plans people are actually on.':
    'Teilnahmen, die Kartei nach Status, und welche Tarife tatsächlich genutzt werden.',
  Automation: 'Automatisierung',
  Automations: 'Automatisierungen',

  // ── money and terms ──
  Billed: 'Abgerechnet',
  'Billed by the studio': 'Vom Studio abgerechnet',
  'Blocks this person is on. Joining holds their place for every week of it.':
    'Kursblöcke, an denen diese Person teilnimmt. Der Platz ist für jede Woche reserviert.',
  Blurb: 'Kurztext',
  Book: 'Buchen',
  'Book a class': 'Kurs buchen',
  Booked: 'Gebucht',
  Booking: 'Buchen',
  'Bookings show up here as they come in.': 'Buchungen erscheinen hier, sobald sie eingehen.',
  Bought: 'Gekauft',
  'Build one from scratch': 'Von Grund auf erstellen',
  'Busiest hours': 'Stärkste Zeiten',
  'By program': 'Nach Kursart',

  Cancel: 'Abbrechen',
  Cancelled: 'Abgesagt',
  'Cancelled. The place is free again.': 'Storniert. Der Platz ist wieder frei.',
  Card: 'Karte',
  Cash: 'Bar',
  'Change a role': 'Rolle ändern',
  'Change it': 'Ändern',
  'Check in': 'Check-in',
  'Check your email': 'Sieh in deinem Postfach nach',
  'Check-ins': 'Check-ins',
  'Check-ins by time of day — where to add a class, and where to stop paying for an empty room.':
    'Check-ins nach Tageszeit — wo ein Kurs dazugehört und wo sich ein leerer Raum nicht mehr rechnet.',
  'Checked in today': 'Heute eingecheckt',
  Choose: 'Auswählen',
  'Choose a pass': 'Blockkarte wählen',
  'Choose a plan': 'Tarif wählen',
  Chrome: 'Rahmen',
  Class: 'Kurs',
  'Class credits. A drop-in is a one-credit pass; attending is what spends one.':
    'Kursguthaben. Eine Einzelstunde ist eine Blockkarte mit einer Einheit; die Teilnahme verbraucht sie.',
  'Class name': 'Kursname',
  'Class type': 'Kursart',
  'Class types': 'Kursarten',
  Classes: 'Kurse',
  'Classes appear here once the weekly schedule is set.':
    'Kurse erscheinen hier, sobald der Wochenplan steht.',
  'Classes in the pack': 'Einheiten im Paket',
  'Classes included': 'Enthaltene Einheiten',
  'Classes today': 'Kurse heute',
  'Clear it': 'Zurücksetzen',
  'Clear it?': 'Zurücksetzen?',
  'Close it': 'Schließen',
  Colour: 'Farbe',
  'Colours for now. Studio-specific layouts are coming.':
    'Vorerst Farben. Studio-eigene Layouts folgen.',
  'Coming up': 'Demnächst',
  'Committed until': 'Gebunden bis',
  Complimentary: 'Kostenfrei',
  'Confirmed places first, then the queue.': 'Zuerst die festen Plätze, dann die Warteliste.',
  Calendar: 'Kalender',
  Contact: 'Kontakt',
  Contacts: 'Kontakte',
  Course: 'Kursblock',
  Courses: 'Kursblöcke',
  'Courses you are on': 'Deine Kursblöcke',
  // The People lens: everybody the studio deals with right now, whatever the
  // relationship. Not "aktuelle Mitglieder" — the whole point of the lens is
  // that it is wider than membership.
  Current: 'Aktuell',
  'In use': 'In Verwendung',

  Date: 'Datum',
  Day: 'Tag',
  'Direct debit': 'Lastschrift',
  'Do this': 'Ausführen',
  'Drop into anything on the timetable, or join a course and hold your place for the whole block.':
    'Nimm spontan an allem im Stundenplan teil, oder tritt einem Kursblock bei und sichere dir deinen Platz für den ganzen Zeitraum.',
  Due: 'Fällig',

  Edit: 'Bearbeiten',
  'Edit person': 'Person bearbeiten',
  'Eight a month': 'Acht pro Monat',
  Email: 'E-Mail',
  'Email me a link': 'Link zusenden',
  'email them': 'ihnen schreiben',
  Emerald: 'Smaragd',
  'End now': 'Jetzt beenden',
  Ends: 'Endet',
  Enrol: 'Eintragen',
  'every active subscription, normalised': 'alle aktiven Mitgliedschaften, normalisiert',
  'Every dated class, for the next fortnight — generated from everything that runs.':
    'Jeder Kurstermin der nächsten zwei Wochen — erzeugt aus allem, was läuft.',
  'Everybody has been in.': 'Alle waren da.',
  'Everybody who holds a place on this block.': 'Alle mit einem Platz in diesem Kursblock.',
  Everyone: 'Alle',
  'Everyone — members, prospects, pass holders, contacts — one list, filtered by relationship.':
    'Alle — Mitglieder, Interessenten, Blockkarten-Inhaber, Kontakte — eine Liste, nach Beziehung gefiltert.',
  'Everyone the studio deals with, filtered by relationship.':
    'Alle, mit denen das Studio zu tun hat, nach Beziehung gefiltert.',
  'Everything on sale — plans and passes. Retiring one keeps everybody already paying for it.':
    'Alles im Verkauf — Tarife und Blockkarten. Ein eingestellter Tarif bleibt für alle bestehen, die ihn schon zahlen.',
  'Everything on the timetable, and the courses you can join.':
    'Alles im Stundenplan, und die Kursblöcke, denen du beitreten kannst.',
  'Everything that runs — weekly classes and bounded courses, in one list.':
    'Alles, was läuft — wöchentliche Kurse und befristete Kursblöcke, in einer Liste.',
  'Everything this studio runs. A class repeats every week; a course runs between two dates for a price. The calendar is generated from both.':
    'Alles, was dieses Studio anbietet. Ein Kurs wiederholt sich wöchentlich; ein Kursblock läuft zwischen zwei Terminen zu einem Preis. Der Kalender wird aus beidem erzeugt.',
  'Everything this studio sells — plans and passes. Retiring one keeps everybody already on it.':
    'Alles, was dieses Studio verkauft — Tarife und Blockkarten. Ein eingestellter Tarif bleibt für alle bestehen, die ihn schon haben.',
  'Everything you are booked into.': 'Alles, wofür du gebucht bist.',
  'Expected monthly': 'Erwartet pro Monat',

  'First seen': 'Erstkontakt',
  Five: 'Fünf',
  'For the whole block, not per class.': 'Für den ganzen Block, nicht pro Kurs.',
  'For the whole block.': 'Für den ganzen Block.',
  'Four a month': 'Vier pro Monat',
  'Free trial until': 'Probetraining bis',
  Fri: 'Fr',
  'from active plans': 'aus aktiven Tarifen',
  'Front desk': 'Empfang',
  Fuchsia: 'Fuchsia',

  'Gave notice': 'Gekündigt',
  'Give notice': 'Kündigen',
  'Given notice': 'Gekündigt',
  'Gone quiet': 'Inaktiv geworden',
  'Good afternoon': 'Guten Tag',
  'Good evening': 'Guten Abend',
  'Good morning': 'Guten Morgen',

  Hour: 'Stunde',
  'A contact tag': 'Ein Kontakt-Tag',
  'A course place': 'Ein Kursblock-Platz',
  'A membership': 'Eine Mitgliedschaft',
  'A pass': 'Eine Blockkarte',
  'A staff role': 'Eine Team-Rolle',
  Anything: 'Alles',
  'What they hold': 'Was jemand hat',
  'Nothing yet': 'Noch nichts',
  'Joining fee': 'Aufnahmegebühr',
  'Charged once, with the first payment. Create it as a one-off first and it appears here.':
    'Einmalig berechnet, mit der ersten Zahlung. Leg sie zuerst als Einzelposten an, dann erscheint sie hier.',
  'Add something to sell': 'Etwas zum Verkauf anlegen',
  Block: 'Block',
  'Bounded blocks with their own price. Edited under Schedule → Classes, because they carry a timetable.': 'Begrenzte Blöcke mit eigenem Preis. Bearbeitet unter Plan → Kurse, weil sie einen Zeitplan haben.',
  'Colours and words for now. Studio-specific layouts are coming.': 'Farben und Sprache vorerst. Studio-eigene Layouts kommen noch.',
  'Course blocks': 'Kursblöcke',
  'Everything a member can pay for.': 'Alles, wofür ein Mitglied zahlen kann.',
  'Everything a member can pay for. Retiring one keeps everybody already on it.': 'Alles, wofür ein Mitglied zahlen kann. Ein eingestelltes Angebot bleibt für alle bestehen, die es schon haben.',
  'Memberships, class passes, drop-ins and one-offs. Retiring one keeps everybody already on it.': 'Mitgliedschaften, Blockkarten, Einzelstunden und Einzelposten. Ein eingestelltes Angebot bleibt für alle bestehen, die es schon haben.',
  'No course blocks. Add one under Schedule → Classes.': 'Keine Kursblöcke. Leg einen unter Plan → Kurse an.',
  Offers: 'Angebote',
  Selling: 'Verkauf',
  'The look and the language every member and every member of staff sees.': 'Das Erscheinungsbild und die Sprache, die jedes Mitglied und jedes Teammitglied sieht.',
  'What has come in, and what is on its way.': 'Was eingegangen ist, und was unterwegs ist.',
  'What this studio can turn on — payments, and anything else on offer.': 'Was dieses Studio aktivieren kann — Zahlungen und alles andere im Angebot.',
  'Who this studio is on paper — the name, the address and the number a payment provider asks for.': 'Wer dieses Studio auf dem Papier ist — der Name, die Adresse und die Nummer, nach der ein Zahlungsanbieter fragt.',
  'Who this studio is on paper. A payment provider asks for these before it will take money, and they appear on what your members are sent.': 'Wer dieses Studio auf dem Papier ist. Ein Zahlungsanbieter fragt danach, bevor er Geld annimmt, und es erscheint auf dem, was deine Mitglieder erhalten.',
  'Who this studio is, and how it is set up.': 'Wer dieses Studio ist und wie es eingerichtet ist.',
  Address: 'Adresse',
  'As it appears on the register — not the name above the door, if they differ.': 'Wie im Register eingetragen — nicht der Name über der Tür, falls sie sich unterscheiden.',
  'Registered name': 'Eingetragener Name',
  'Save business details': 'Unternehmensdaten speichern',
  'UID, USt-IdNr, VAT number — whatever it is called where you are. Leave it empty if the business is not registered for VAT.': 'UID, USt-IdNr, VAT-Nummer — wie auch immer sie bei dir heißt. Leer lassen, wenn das Unternehmen nicht umsatzsteuerpflichtig ist.',
  'VAT number': 'UID-Nummer',
  'Where the business trades from.': 'Von wo aus das Unternehmen tätig ist.',
  'Remove this add-on?': 'Dieses Add-on entfernen?',
  'Its screens go away for everyone here. Anything it was already doing outside this app — payments a provider is collecting, for instance — carries on, and you will not be able to see it from here until you add the add-on back.':
    'Seine Ansichten verschwinden für alle hier. Was es außerhalb dieser App bereits tut — etwa Zahlungen, die ein Anbieter einzieht — läuft weiter, und du kannst es von hier aus erst wieder sehen, wenn du das Add-on erneut hinzufügst.',
  'Nothing recorded yet': 'Noch nichts erfasst',
  'A company': 'Ein Unternehmen',
  'A sole trader': 'Ein Einzelunternehmen',
  Business: 'Unternehmen',
  // The third verb on the price list. Retiring is for a product a studio
  // stopped selling; this is for the row that was never one.
  Delete: 'Löschen',
  'Nobody has ever taken this — deleting it removes it for good.':
    'Das hat nie jemand genommen — löschen entfernt es endgültig.',
  'One person holds this. Retiring keeps them on it.':
    'Eine Person hat das. Beim Einstellen behält sie es.',
  '{n} people hold this. Retiring keeps them on it.':
    '{n} Personen haben das. Beim Einstellen behalten sie es.',
  'Decides what a payment provider asks you for. Hard to change once an account exists, so it is worth getting right now.': 'Bestimmt, was ein Zahlungsanbieter von dir verlangt. Nach dem Anlegen eines Kontos kaum noch änderbar — jetzt lohnt es sich, es richtig zu setzen.',
  'What kind of business this is': 'Um welche Art von Unternehmen es sich handelt',
  'A one-off — sold once, grants nothing': 'Ein Einzelposten — einmal verkauft, berechtigt zu nichts',
  'Grants nothing': 'Berechtigt zu nichts',
  'Nothing bought outright.': 'Nichts einmalig gekauft.',
  Once: 'Einmalig',
  'Paid at the studio': 'Im Studio bezahlt',
  'What a member pays each period — or once, for a pass or a one-off.': 'Was ein Mitglied je Zeitraum zahlt — oder einmalig, bei einer Blockkarte oder einem Einzelposten.',
  'Daily': 'Täglich',
  'Weekly': 'Wöchentlich',
  'Every {n} days': 'Alle {n} Tage',
  'Every {n} weeks': 'Alle {n} Wochen',
  'Every {n} months': 'Alle {n} Monate',
  'Every {n} years': 'Alle {n} Jahre',
  'a day': 'pro Tag',
  'a week': 'pro Woche',
  'every {n} days': 'alle {n} Tage',
  'every {n} weeks': 'alle {n} Wochen',
  'every {n} months': 'alle {n} Monate',
  'every {n} years': 'alle {n} Jahre',
  '{n} {per}': '{n} {per}',
  '{n} classes {per}': '{n} Kurse {per}',
  'Billed every': 'Abgerechnet alle',
  'Leave it empty for every one.': 'Leer lassen für jede einzelne.',
  'Days': 'Tage',
  'Weeks': 'Wochen',
  'Months': 'Monate',
  'Years': 'Jahre',
  'How long before leaving takes effect. Notice inside a minimum term still runs to the end of it.':
    'Wie lange es bis zum Austritt dauert. Eine Kündigung innerhalb der Mindestlaufzeit läuft bis zu deren Ende.',
  'How long before leaving takes effect. Notice inside a minimum term still runs to the end of it. Empty or 0 ends it immediately.':
    'Wie lange es bis zum Austritt dauert. Eine Kündigung innerhalb der Mindestlaufzeit läuft bis zu deren Ende. Leer oder 0 beendet sie sofort.',
  'How long the pack lives once it is bought. Leave it empty and it never expires.':
    'Wie lange die Blockkarte nach dem Kauf gültig ist. Leer lassen, dann verfällt sie nie.',
  'How long they commit for. Leaving early does not end the obligation.':
    'Wie lange die Bindung dauert. Ein früherer Austritt beendet die Verpflichtung nicht.',
  'How long they commit for. Leaving early does not end the obligation. Empty or 0 is rolling.':
    'Wie lange die Bindung dauert. Ein früherer Austritt beendet die Verpflichtung nicht. Leer oder 0 heißt laufend.',
  'How many classes a period buys. Leave it empty for unlimited.':
    'Wie viele Kurse ein Zeitraum umfasst. Leer lassen für unbegrenzt.',
  'How the membership base splits.': 'Wie sich die Mitglieder aufteilen.',
  'How they sign in. A member who starts teaching keeps the address — and the same person record.':
    'Womit sie sich anmelden. Wer vom Mitglied zur Kursleitung wird, behält die Adresse — und denselben Personendatensatz.',
  'How they sign in. If we already know this address we reuse the person.':
    'Womit sie sich anmelden. Ist die Adresse schon bekannt, wird die vorhandene Person verwendet.',
  'How this stream will be marked on every schedule.':
    'Wie diese Kursart in jedem Plan gekennzeichnet wird.',
  'How this studio is set up.': 'Wie dieses Studio eingerichtet ist.',

  'In the studio’s own timezone.': 'In der Zeitzone des Studios.',
  Indigo: 'Indigo',
  'inside a minimum term': 'innerhalb der Mindestlaufzeit',
  Install: 'Installieren',
  Instructor: 'Trainer',
  'Internal only — the member never sees this.': 'Nur intern — das Mitglied sieht das nie.',
  Integration: 'Integration',
  // Reads under the new person's name, which is the Hero's title above it.
  'is on the roll and can be booked from today.':
    'steht in der Kartei und kann ab heute gebucht werden.',
  // The other half of the same sentence: what they became once a plan started.
  'is a member from today.': 'ist ab heute Mitglied.',

  Join: 'Beitreten',
  'Join once and your place is held for every week of the block.':
    'Einmal beitreten, und dein Platz ist für jede Woche des Blocks reserviert.',
  Joined: 'Beigetreten',

  Language: 'Sprache',
  'Last day': 'Letzter Tag',
  Leave: 'Austreten',
  'Leave empty for no trial window.': 'Leer lassen für kein Probetraining.',
  'Leave unassigned if you have not decided — the class still runs.':
    'Leer lassen, wenn noch nichts entschieden ist — der Kurs läuft trotzdem.',
  Leaving: 'Austritte',
  Left: 'Ausgetreten',
  Lime: 'Limette',
  List: 'Liste',

  Manager: 'Leitung',
  Member: 'Mitglied',
  'Member since': 'Mitglied seit',
  Members: 'Mitglieder',
  Message: 'Nachricht',
  'Minimum term': 'Mindestlaufzeit',
  'Minimum term (months)': 'Mindestlaufzeit (Monate)',
  Minutes: 'Minuten',
  Mon: 'Mo',
  Money: 'Finanzen',
  Monthly: 'Monatlich',
  'Monthly run rate': 'Hochgerechnet pro Monat',
  More: 'Mehr',
  'My classes': 'Meine Kurse',
  'My membership': 'Meine Mitgliedschaft',

  Name: 'Name',
  'Name and email are all we need. Everything else can wait.':
    'Name und E-Mail genügen. Alles andere kann warten.',
  'Never expires': 'Läuft nie ab',
  'New person': 'Neue Person',
  'No active member has missed the whole window.':
    'Kein aktives Mitglied hat den gesamten Zeitraum verpasst.',
  'No active subscription has given notice.': 'Keine aktive Mitgliedschaft wurde gekündigt.',
  'No attendance recorded yet.': 'Noch keine Teilnahmen erfasst.',
  'No classes means nobody to check in.': 'Keine Kurse, also niemand zum Einchecken.',
  'No classes scheduled.': 'Keine Kurse geplant.',
  'No classes yet.': 'Noch keine Kurse.',
  'No courses running just now.': 'Zurzeit laufen keine Kursblöcke.',
  'No courses running.': 'Keine laufenden Kursblöcke.',
  'No members yet.': 'Noch keine Mitglieder.',
  'No commitment': 'Keine Bindung',
  'No minimum — rolling': 'Keine Mindestlaufzeit — laufend',
  'No passes.': 'Keine Blockkarten.',
  'No programs yet.': 'Noch keine Kursarten.',
  'No recipes in this version.': 'Keine Vorlagen in dieser Version.',
  'No themes available.': 'Keine Erscheinungsbilder verfügbar.',
  'Nobody booked into this one.': 'Für diesen Termin hat niemand gebucht.',
  'Nobody has joined yet.': 'Noch niemand beigetreten.',
  'Nobody here yet.': 'Noch niemand hier.',
  'Nobody is due.': 'Niemand ist fällig.',
  'Nobody is leaving.': 'Niemand tritt aus.',
  'Nobody on a plan yet.': 'Noch niemand in einem Tarif.',
  'Nobody on staff yet.': 'Noch niemand im Team.',
  'Nobody yet.': 'Noch niemand.',
  'None — ends immediately': 'Keine — endet sofort',
  'None yet.': 'Noch keine.',
  'Not enough history yet.': 'Noch zu wenig Verlauf.',
  'Not given': 'Nicht angegeben',
  'Not on any course.': 'In keinem Kursblock.',
  'Not yet': 'Noch nicht',
  'Noted. Your membership runs to its last day as agreed.':
    'Vermerkt. Deine Mitgliedschaft läuft wie vereinbart bis zum letzten Tag.',
  Notes: 'Notizen',
  'Nothing attended yet.': 'Noch keine Teilnahme.',
  'Nothing booked yet.': 'Noch nichts gebucht.',
  'Nothing is automated yet.': 'Noch nichts automatisiert.',
  'Nothing noted.': 'Nichts vermerkt.',
  'Nothing on offer yet.': 'Noch kein Angebot.',
  'Nothing on sale just now.': 'Zurzeit nichts im Verkauf.',
  'Nothing on sale yet. Add a plan or a pass and it becomes sellable immediately.':
    'Noch nichts im Verkauf. Leg einen Tarif oder eine Blockkarte an, und beides ist sofort verkäuflich.',
  'Nothing on the timetable.': 'Nichts im Stundenplan.',
  'Nothing on today.': 'Heute nichts.',
  'Nothing queued.': 'Nichts in der Warteschlange.',
  'Nothing recorded': 'Nichts erfasst',
  'Nothing running. Starting a plan grants access from today; how the money moves is its own question.':
    'Nichts aktiv. Ein gestarteter Tarif gewährt ab heute Zugang; wie die Zahlung läuft, ist eine eigene Frage.',
  'Nothing scheduled in the next five weeks.': 'Nichts in den nächsten fünf Wochen geplant.',
  'Nothing scheduled today.': 'Heute nichts geplant.',
  'Nothing to read.': 'Nichts zu lesen.',
  Notice: 'Kündigung',
  'Notice given': 'Gekündigt',
  'notice given, date already fixed': 'gekündigt, Datum steht bereits fest',
  'Notice period': 'Kündigungsfrist',
  'Notice period (days)': 'Kündigungsfrist (Tage)',
  'Notice runs its course — a commitment outlives notice given inside it.':
    'Die Kündigungsfrist läuft ab — eine Bindung überdauert eine Kündigung innerhalb der Laufzeit.',
  Notices: 'Mitteilungen',

  'Offer again': 'Wieder anbieten',
  'On a course': 'In einem Kursblock',
  'On it': 'Dabei',
  'On sale': 'Im Verkauf',
  'on the books': 'in der Kartei',
  'On trial': 'Im Probetraining',
  'One — a drop-in': 'Eine — Einzelstunde',
  'One class IS the drop-in — no separate thing to set up.':
    'Eine Einheit IST die Einzelstunde — nichts Zusätzliches einzurichten.',
  'One month': 'Ein Monat',
  'Or sign in as — demo only': 'Oder anmelden als — nur zur Demo',
  Outbox: 'Postausgang',
  Owner: 'Inhaber',

  Paid: 'Bezahlt',
  'Paid until': 'Bezahlt bis',
  Pass: 'Blockkarte',
  'Pass holder': 'Blockkarten-Inhaber',
  Passes: 'Blockkarten',
  // The lens for people the studio no longer deals with — former members and
  // lapsed contacts alike, so the word is about the person and not the tense.
  Past: 'Ehemalige',
  Pause: 'Pausieren',
  Paused: 'Pausiert',
  'Paused. It will not fire on its own; you still can.':
    'Pausiert. Sie löst nicht mehr von selbst aus; du kannst es weiterhin.',
  'Paused. Resume whenever you are ready.': 'Pausiert. Fortsetzen, wann immer du möchtest.',
  People: 'Personen',
  'People appear once somebody asks, signs up, or the desk writes them down.':
    'Personen erscheinen, sobald jemand anfragt, sich anmeldet oder der Empfang sie einträgt.',
  Person: 'Person',
  Phone: 'Telefon',
  'Pick a class, then tap people as they arrive.':
    'Wähle einen Kurs und tippe die Personen an, sobald sie kommen.',
  'Pick a look. It applies to everyone at this studio, immediately.':
    'Wähle ein Erscheinungsbild. Es gilt sofort für alle in diesem Studio.',
  'Pick a plan below — you will confirm the terms before anything starts.':
    'Wähle unten einen Tarif — die Bedingungen bestätigst du, bevor irgendetwas beginnt.',
  'Pick something from Book a class.': 'Wähle etwas unter Kurs buchen aus.',
  'Pick the days. The classes are generated between the start and the end.':
    'Wähle die Tage. Die Kurse werden zwischen Start und Ende erzeugt.',
  Place: 'Platz',
  Places: 'Plätze',
  Plan: 'Tarif',
  'Plan and terms': 'Tarif und Bedingungen',
  'Plan uptake': 'Tarifnutzung',
  Preview: 'Vorschau',
  'Preview one before you trust it.': 'Sieh dir eine Vorschau an, bevor du dich darauf verlässt.',
  Price: 'Preis',
  Pricing: 'Preise',
  Program: 'Kursart',
  Prospect: 'Interessent',
  Prospects: 'Interessenten',
  'Put back on': 'Wieder aktivieren',
  'Put back on staff': 'Wieder ins Team aufnehmen',
  'Put it on': 'Aktivieren',
  'Put somebody on staff': 'Jemanden ins Team aufnehmen',
  'Put them on': 'Aufnehmen',
  'Put them on something now, or leave it — they are on the roll either way.':
    'Nimm sie jetzt in einen Tarif auf oder lass es — in der Kartei stehen sie so oder so.',

  'Sent in your studio’s name. Every message is kept in the outbox, so you can see what went and what did not.':
    'Wird im Namen deines Studios gesendet. Jede Nachricht bleibt im Postausgang, damit du siehst, was gesendet wurde und was nicht.',
  'Quiet day. The timetable is where classes get added.':
    'Ruhiger Tag. Kurse werden im Stundenplan angelegt.',

  'Ran it. Anything it produced is on the follow-up list or in the outbox.':
    'Ausgeführt. Alles Entstandene steht in den Mitteilungen oder im Postausgang.',
  'Read them': 'Lesen',
  // "Rezepte" kept the English metaphor and lost the argument to its own
  // neighbours: every sentence ABOUT a recipe already said Vorlage ("Eine
  // Vorlage füllt das Formular für dich aus", "Der Reiter Vorlagen"), so the
  // tab was the only place the metaphor survived and it read as a different
  // feature from the one described underneath it. One word wins; this is it.
  Recipes: 'Vorlagen',
  'Record payment': 'Zahlung erfassen',
  Remove: 'Entfernen',
  'Remove from staff': 'Aus dem Team entfernen',
  Reports: 'Berichte',
  Resume: 'Fortsetzen',
  Retention: 'Bindung',
  Retire: 'Einstellen',
  Role: 'Rolle',
  'Role changed. Their application has already adopted it.':
    'Rolle geändert. Die Anwendung hat sie bereits übernommen.',
  Rolling: 'Laufend',
  Rose: 'Rosé',
  'Run at': 'Ausführen um',
  'Run now': 'Jetzt ausführen',
  Runs: 'Ausführungen',

  Sat: 'Sa',
  Save: 'Speichern',
  Schedule: 'Plan',
  'Search by name or email': 'Nach Name oder E-Mail suchen',
  Seats: 'Plätze',
  Sell: 'Verkaufen',
  'Sell pass': 'Blockkarte verkaufen',
  'Set it up': 'Einrichten',
  Settings: 'Einstellungen',
  'Show more': 'Mehr anzeigen',
  'Sign in': 'Anmelden',
  'Sign out': 'Abmelden',
  'Sign somebody else up': 'Eine andere Person anmelden',
  'Single classes': 'Einzelstunden',
  'Six months': 'Sechs Monate',
  'Six slots of one thing and one of another, to the same headcount, is a timetable problem.':
    'Sechs Termine der einen Art und einer der anderen, bei gleicher Teilnehmerzahl, ist ein Stundenplan-Problem.',
  'Six weeks, from nothing.': 'Sechs Wochen, von null.',
  'Sixteen a month': 'Sechzehn pro Monat',
  Sky: 'Himmelblau',
  'somebody joins': 'jemand beitritt',
  'Soonest first — the one you can still talk to is at the top.':
    'Nächste zuerst — wer noch ansprechbar ist, steht oben.',
  Staff: 'Team',
  Standing: 'Status',
  'Start it': 'Starten',
  'Start plan': 'Tarif starten',
  Starts: 'Beginnt',
  'Starts at': 'Beginnt um',
  'Starts today. You will confirm the terms before anything is signed.':
    'Beginnt heute. Die Bedingungen bestätigst du, bevor etwas abgeschlossen wird.',
  State: 'Status',
  Status: 'Status',
  'Still paying, not turning up. Nobody has cancelled — yet.':
    'Zahlen noch, kommen aber nicht mehr. Gekündigt hat noch niemand.',
  Stone: 'Stein',
  Studio: 'Studio',
  Subject: 'Betreff',
  Sun: 'So',
  'Switching language — one moment.': 'Sprache wird umgestellt — einen Moment.',

  'Take off': 'Entfernen',
  'Taught by': 'Kursleitung',
  Teacher: 'Trainer',
  Teal: 'Petrol',
  Ten: 'Zehn',
  Terms: 'Bedingungen',
  'The four roles the charter defines. Nothing here can invent a fifth.':
    'Die vier Rollen, die die Charta definiert. Hier lässt sich keine fünfte erfinden.',
  'The instant this reacts to.': 'Der Moment, auf den das reagiert.',
  'The studio bills them': 'Das Studio stellt in Rechnung',
  'The kinds of class this studio teaches — Vinyasa, Fundamentals, Competition. Each carries a colour the timetable uses.':
    'Die Kursarten, die dieses Studio anbietet — Vinyasa, Fundamentals, Competition. Jede trägt eine Farbe, die der Stundenplan verwendet.',
  'The look every member and every member of staff sees.':
    'Das Erscheinungsbild, das jedes Mitglied und jede Person im Team sieht.',
  'The moment a subscription starts — the highest-value minute a studio has, and the one nothing used to notice.':
    'Der Moment, in dem eine Mitgliedschaft beginnt — die wertvollste Minute eines Studios, und die, die früher niemandem auffiel.',
  'The moment a subscription starts — the highest-value minute a studio has, and the one nothing used to notice. Sent in your studio’s name. Every message is kept in the outbox, so you can see what went and what did not.':
    'Der Moment, in dem eine Mitgliedschaft beginnt — die wertvollste Minute eines Studios, und die, die früher niemandem auffiel. Wird im Namen Ihres Studios gesendet. Jede Nachricht bleibt im Postausgang, damit Sie sehen, was gesendet wurde und was nicht.',
  'The next two weeks, generated from everything under Classes.':
    'Die nächsten zwei Wochen, erzeugt aus allem unter Kurse.',
  'The recipes tab has eight things studios usually want.':
    'Der Reiter Vorlagen enthält acht Dinge, die Studios üblicherweise brauchen.',
  'The register, and what to do about whom.': 'Die Anwesenheit, und was bei wem zu tun ist.',
  'The roll': 'Die Kartei',
  'The things that happen without anybody doing them. Preview one to see exactly what it would do before it does anything.':
    'Die Dinge, die ohne Zutun passieren. Sieh dir eine Vorschau an, um genau zu sehen, was sie täte, bevor sie etwas tut.',
  'The window closes on its own — nothing marks it.':
    'Der Zeitraum endet von selbst — nichts markiert das.',
  'Covered until': 'Abgedeckt bis',
  Theme: 'Erscheinungsbild',
  'They changed their mind': 'Sie haben es sich anders überlegt',
  'Things an installed add-on has told the studio. Lyra’s own automations do not write here — anything Lyra can answer with a query is a screen, not a list.':
    'Was ein installiertes Add-on dem Studio mitgeteilt hat. Lyras eigene Automatisierungen schreiben hier nicht — was Lyra per Abfrage beantworten kann, ist ein Bildschirm, keine Liste.',
  'Thirty days': 'Dreißig Tage',
  'This cannot be undone.': 'Das lässt sich nicht rückgängig machen.',
  'This one runs as it happens, within a minute. There is no time to set.':
    'Diese läuft, sobald es passiert, innerhalb einer Minute. Es gibt keine Uhrzeit einzustellen.',
  'Three months': 'Drei Monate',
  Thu: 'Do',
  Time: 'Uhrzeit',
  Timetable: 'Stundenplan',
  Today: 'Heute',
  "Today's classes": 'Kurse heute',
  Transfer: 'Überweisung',
  'Trial over': 'Probetraining beendet',
  Tue: 'Di',
  'Twelve a month': 'Zwölf pro Monat',
  'Twelve months': 'Zwölf Monate',
  Twenty: 'Zwanzig',
  'Twenty-four months': 'Vierundzwanzig Monate',
  'Two months': 'Zwei Monate',
  'Two weeks': 'Zwei Wochen',

  Unassigned: 'Nicht zugewiesen',
  'Under contract': 'Vertraglich gebunden',
  Unlimited: 'Unbegrenzt',
  'Use a different address': 'Andere Adresse verwenden',

  'Valid for': 'Gültig für',
  'Valid for (days)': 'Gültig für (Tage)',
  Violet: 'Violett',

  'Walk-ins can still be checked in from the member record.':
    'Spontane Teilnehmer lassen sich weiterhin über den Personendatensatz einchecken.',
  'We will email you a link. No password to remember, and none to lose.':
    'Wir schicken dir einen Link per E-Mail. Kein Passwort zu merken und keines zu verlieren.',
  Wed: 'Mi',
  Week: 'Woche',
  'Week by week': 'Woche für Woche',
  'Welcome back.': 'Willkommen zurück.',
  'What a class IS — Vinyasa, Fundamentals, Competition. No times; everything above refers to one.':
    'Was ein Kurs IST — Vinyasa, Fundamentals, Competition. Keine Zeiten; alles darüber bezieht sich darauf.',
  'What a member pays each period — or once, for a pass.':
    'Was ein Mitglied je Zeitraum zahlt — oder einmalig, bei einer Blockkarte.',
  'What an installed add-on has told the studio.':
    'Was ein installiertes Add-on dem Studio mitgeteilt hat.',
  'What happened': 'Was passiert ist',
  'What happens overnight, and what it has done lately.':
    'Was über Nacht passiert, und was zuletzt geschehen ist.',
  'What is it': 'Was ist es',
  'What it would do': 'Was sie täte',
  'What kind of class this block teaches.': 'Welche Kursart dieser Block unterrichtet.',
  'What kind of class this is. The type carries the colour the timetable uses.':
    'Welche Kursart das ist. Die Art trägt die Farbe, die der Stundenplan verwendet.',
  'What people are actually on — and why a retired plan keeps its subscribers.':
    'Was tatsächlich genutzt wird — und warum ein eingestellter Tarif seine Mitglieder behält.',
  'Every message the automations have sent, and every one that did not go — with the reason beside it.':
    'Jede Nachricht, die die Automatisierungen gesendet haben, und jede, die nicht ankam — mit dem Grund daneben.',
  'What the desk has written down. Members never see this.':
    'Was der Empfang notiert hat. Mitglieder sehen das nie.',
  'What the studio charges, and what it earns.': 'Was das Studio verlangt und was es einnimmt.',
  'What they can do from the moment they sign in. Changeable on the roster, at any time.':
    'Was sie ab der Anmeldung tun können. Jederzeit im Team änderbar.',
  'What they would receive. Your words, in your studio’s name.':
    'Was sie erhalten würden. Deine Worte, im Namen deines Studios.',
  'What this studio can turn on.': 'Was dieses Studio aktivieren kann.',
  'What this studio can turn on. Screens land where they belong — a store, not a menu.':
    'Was dieses Studio aktivieren kann. Bildschirme landen dort, wo sie hingehören — ein Store, kein Menü.',
  'What this studio reads in': 'Worin dieses Studio liest',
  'What you are booked into, and what you are waiting for.':
    'Wofür du gebucht bist, und worauf du wartest.',
  'What you are on, and since when.': 'Was du hast, und seit wann.',
  'What you have booked.': 'Was du gebucht hast.',
  'What you hold, and since when.': 'Was du hast, und seit wann.',
  When: 'Wann',
  'When it meets': 'Wann er stattfindet',
  'When somebody joins, email them': 'Wenn jemand beitritt, ihnen schreiben',
  'When things happen, and what is on offer.': 'Wann was stattfindet, und was angeboten wird.',
  'When this happens': 'Wenn das passiert',
  'Where the week actually goes.': 'Wofür die Woche draufgeht.',
  'Who has arrived, and who was expected.': 'Wer da ist, und wer erwartet wurde.',
  'Who has stopped coming, who has given notice, and what both are worth a month.':
    'Wer nicht mehr kommt, wer gekündigt hat, und was beides monatlich wert ist.',
  'Who is coming': 'Wer kommt',
  'Who is drifting, and what it is worth.': 'Wer abspringt, und was das wert ist.',
  'Who is on it': 'Wer dabei ist',
  'Who is on this': 'Wer dabei ist',
  'Who works here and what they can do. Changing a role changes their whole application.':
    'Wer hier arbeitet und was diese Personen tun können. Eine geänderte Rolle ändert ihre gesamte Anwendung.',
  'Who works here, and what they can do. Changing a role changes their whole application — no sign-out needed.':
    'Wer hier arbeitet, und was diese Personen tun können. Eine geänderte Rolle ändert ihre gesamte Anwendung — ohne Abmelden.',
  'With us since': 'Dabei seit',
  'Withdrawn. Your places are free again.': 'Ausgetragen. Deine Plätze sind wieder frei.',
  Worth: 'Wert',

  Yearly: 'Jährlich',
  'Yes, clear it': 'Ja, zurücksetzen',
  'Yes, do it': 'Ja, ausführen',
  'You are on the course. Every week is booked for you.':
    'Du bist im Kursblock. Jede Woche ist für dich gebucht.',
  'You are on. The studio will sort payment out with you.':
    'Du bist dabei. Das Studio klärt die Zahlung mit dir.',
  'Your classes and your membership.': 'Deine Kurse und deine Mitgliedschaft.',

  // ── the automation vocabulary ────────────────────────────
  //
  // Seeded into `automation_moments` / `_effects` / `_recipes` and rendered as
  // row data. The moment and effect labels are SENTENCE FRAGMENTS that the
  // form joins into "Wenn <moment>, <effect>" — so each one is translated to
  // fit that frame, not as a standalone phrase.
  'somebody enquires': 'jemand anfragt',
  'somebody stops coming': 'jemand nicht mehr kommt',
  'a trial is about to run out': 'ein Probetraining bald ausläuft',
  "it is the day before somebody's class": 'es der Tag vor jemandes Kurs ist',

  // THE SAME FIVE MOMENTS, WELDED. The form's picker builds its labels as
  // `When ${moment.label}` in TypeScript, so each pairing reaches the screen as
  // one finished English sentence rather than as the fragment above. A pattern
  // would be wrong here rather than merely verbose: German moves the verb to
  // the end after "wenn", so "Wenn " + "jemand tritt bei" is not a sentence
  // anybody would write. Five rows, one per moment — and the harvest now sees
  // this array, so a sixth moment turns the gate red instead of shipping
  // English.
  'When somebody joins': 'Wenn jemand beitritt',
  'When somebody enquires': 'Wenn jemand anfragt',
  'When somebody stops coming': 'Wenn jemand nicht mehr kommt',
  'When a trial is about to run out': 'Wenn ein Probetraining bald ausläuft',
  "When it is the day before somebody's class": 'Wenn es der Tag vor jemandes Kurs ist',

  'Days of notice': 'Tage Vorlauf',
  'Days without a visit': 'Tage ohne Besuch',
  'The moment somebody new is written down. Replying within minutes is the difference between a member and a lost one.':
    'Der Moment, in dem jemand Neues eingetragen wird. Eine Antwort innerhalb von Minuten entscheidet zwischen Mitglied und verlorener Anfrage.',
  'Still paying, no class attended inside the window. The people a studio loses without noticing.':
    'Zahlen noch, waren im Zeitraum aber in keinem Kurs. Die Leute, die ein Studio verliert, ohne es zu merken.',
  'People whose free window closes within the next few days — while there is still time to ask them.':
    'Personen, deren Probezeitraum in den nächsten Tagen endet — solange noch Zeit bleibt, sie zu fragen.',
  'One message per person per class, so forty reminders retry independently.':
    'Eine Nachricht pro Person und Kurs, damit vierzig Erinnerungen unabhängig voneinander wiederholt werden.',

  // Recipe cards: a title and the one line under it saying why it is worth it.
  'Welcome somebody the day they join': 'Neue am Tag des Beitritts begrüßen',
  'The first week decides whether there is a second year, and right now a new member hears nothing from the studio at all.':
    'Die erste Woche entscheidet, ob es ein zweites Jahr gibt — und derzeit hört ein neues Mitglied überhaupt nichts vom Studio.',
  'Answer an enquiry while they are still interested': 'Auf eine Anfrage antworten, solange das Interesse da ist',
  'Somebody asked about joining and is waiting. An hour later they have asked somewhere else.':
    'Jemand hat wegen einer Mitgliedschaft angefragt und wartet. Eine Stunde später fragt die Person woanders.',
  'Catch a trial before it runs out': 'Ein Probetraining abfangen, bevor es ausläuft',
  'A trial that ends quietly is a member you never had. This is the conversation, a few days early.':
    'Ein Probetraining, das still ausläuft, ist ein Mitglied, das du nie hattest. Das ist das Gespräch, ein paar Tage früher.',
  'Notice somebody who has stopped coming': 'Bemerken, wenn jemand nicht mehr kommt',
  'They are still paying and they have not been in for weeks. Nobody sees it until they cancel.':
    'Sie zahlen noch und waren seit Wochen nicht da. Niemand merkt es, bis sie kündigen.',
  'Remind people the day before their class': 'Am Tag vor dem Kurs erinnern',
  'Empty spots that somebody booked and forgot are the cheapest attendance a studio can buy back.':
    'Gebuchte und vergessene Plätze sind die günstigste Teilnahme, die ein Studio zurückgewinnen kann.',

  // ── placeholders: German examples, so a German form reads like one ──
  'Breath-led, continuous movement. All levels.': 'Atemgeführte, fließende Bewegung. Alle Level.',
  'Foundations — autumn block': 'Grundlagen — Herbstblock',
  'Inversions masterclass': 'Umkehrhaltungen-Masterclass',
  'Morning Flow': 'Morgen-Flow',
  'Vinyasa Flow': 'Vinyasa Flow',

  // ── what the reads manufacture ───────────────────────────
  //
  // Closed-set words and counted PATTERNS from the vex mappings, surfaced by
  // the derived harvest source. A pattern translates whole — '{n} von
  // {total}' is one row however big n gets — and its slots are filled in
  // this language by the pass.
  '{n} a month': '{n} pro Monat',
  '{n} classes': '{n} Kurse',
  '{n} classes a month': '{n} Kurse pro Monat',
  '{n} days': '{n} Tage',
  '{n} matching': '{n} Treffer',
  '{n} months': '{n} Monate',
  '{n} months · {m} days notice': '{n} Monate · {m} Tage Kündigungsfrist',
  '{n} of {total}': '{n} von {total}',
  '{n} of {total} left': 'Noch {n} von {total}',
  '{n}-month minimum': '{n} Monate Mindestlaufzeit',
  '{n}-month minimum · {m} days notice': '{n} Monate Mindestlaufzeit · {m} Tage Kündigungsfrist',
  'Every day at {time}': 'Täglich um {time}',
  'Rolling · {n} days notice': 'Laufend · {n} Tage Kündigungsfrist',
  'Set up: {title}': 'Einrichten: {title}',
  'Valid {n} days': '{n} Tage gültig',
  'When {moment}, {effect}': 'Wenn {moment}, {effect}',

  'a month': 'pro Monat',
  'a year': 'pro Jahr',
  Armed: 'Aktiv',
  'As it happens': 'Sobald es passiert',
  'Card, online': 'Karte, online',
  'Every week': 'Jede Woche',
  Failed: 'Fehlgeschlagen',
  Former: 'Ehemalig',
  Free: 'Gratis',
  Friday: 'Freitag',
  Here: 'Anwesend',
  'Last run': 'Zuletzt ausgeführt',
  Monday: 'Montag',
  'No minimum': 'Keine Mindestlaufzeit',
  None: 'Keine',
  'Not sent': 'Nicht gesendet',
  'Not set up': 'Nicht eingerichtet',
  Offered: 'Im Angebot',
  On: 'Aktiv',
  'One-off': 'Einmalig',
  Refunded: 'Erstattet',
  Retired: 'Eingestellt',
  'Rolling — cancel any time': 'Laufend — jederzeit kündbar',
  Running: 'Läuft',
  Saturday: 'Samstag',
  Sending: 'Wird gesendet',
  Sent: 'Gesendet',
  'Single class': 'Ein Kurs',
  Sunday: 'Sonntag',
  Thursday: 'Donnerstag',
  Tuesday: 'Dienstag',
  'Unlimited classes': 'Unbegrenzt Kurse',
  'Used up': 'Aufgebraucht',
  Waiting: 'Warteliste',
  Wednesday: 'Mittwoch',

  // ── the walk-in desk ─────────────────────────────────────
  'Walk-in': 'Walk-in',
  'At the desk, not on the list.': 'Am Empfang, aber nicht auf der Liste.',
  'Who is here?': 'Wer ist da?',
  'Search by name': 'Nach Namen suchen',
  'Nobody with live access matches.': 'Niemand mit aktivem Zugang passt dazu.',
  'Book & check in': 'Buchen & einchecken',
  'Walk-ins today': 'Walk-ins heute',
  'Check-ins that belong to no class.': 'Check-ins, die zu keinem Kurs gehören.',
  'Nobody outside a class yet.': 'Bisher niemand außerhalb eines Kurses.',
  'A walk-in goes through the picker below.': 'Ein Walk-in läuft über die Auswahl unten.',

  // ── mail, and the consent switch ─────────────────────────
  //
  // The settings screen for outbound mail, and the one switch on the person
  // form it made mandatory. "Domain" stays "Domain" — considered, not skipped:
  // German UIs say Domain, and an entry here stops somebody "fixing" it later.
  'A ceiling, not a target. It is here so one mistake — a bad import, an automation pointed at everybody — cannot run away overnight.':
    'Eine Obergrenze, kein Ziel. Sie ist dafür da, dass ein einzelner Fehler — ein schlechter Import, eine Automatisierung, die auf alle zeigt — nicht über Nacht durchgehen kann.',
  'A subdomain you own. We will show you the records to publish.':
    'Eine Subdomain, die dir gehört. Wir zeigen dir die Einträge, die du hinterlegen musst.',
  'Add domain': 'Domain hinzufügen',
  'Check again': 'Erneut prüfen',
  Domain: 'Domain',
  'hallo@yourstudio.at': 'hallo@deinstudio.at',
  Mail: 'E-Mail',
  'mail.yourstudio.at': 'mail.deinstudio.at',
  'May we email them news and offers?': 'Dürfen wir dieser Person Neuigkeiten und Angebote per E-Mail schicken?',
  'Messages are sent as': 'Nachrichten gehen raus als',
  'Most messages in a day': 'Höchstzahl Nachrichten pro Tag',
  'Not verified yet. DNS takes a while to travel — press Check again in a few minutes.':
    'Noch nicht bestätigt. DNS braucht eine Weile — drück in ein paar Minuten auf Erneut prüfen.',
  'Nothing to publish.': 'Nichts zu hinterlegen.',
  'Optional. Members see your address instead of ours, and your sending reputation stops being shared with anybody.':
    'Optional. Mitglieder sehen deine Adresse statt unserer, und deine Absender-Reputation teilst du mit niemandem mehr.',
  'Publish these records with whoever runs your DNS, then press Check again. It can take minutes or hours — that part is not ours.':
    'Hinterleg diese Einträge bei dem, der dein DNS verwaltet, und drück dann auf Erneut prüfen. Das kann Minuten oder Stunden dauern — dieser Teil liegt nicht bei uns.',
  'Reminders about their own classes go out either way. This is for anything else — and they can take it back from any email.':
    'Erinnerungen an die eigenen Kurse gehen so oder so raus. Das hier gilt für alles andere — und lässt sich aus jeder E-Mail widerrufen.',
  'Replies go to': 'Antworten gehen an',
  'Saved.': 'Gespeichert.',
  'Send again': 'Erneut senden',
  Type: 'Typ',
  Value: 'Wert',
  'Verified — your mail goes out from your own domain.':
    'Bestätigt — deine Mails gehen über deine eigene Domain raus.',
  'Your own address. A member who answers one of these emails reaches you, not us — leave it blank and their reply goes nowhere.':
    'Deine eigene Adresse. Wer auf eine dieser E-Mails antwortet, erreicht dich, nicht uns — bleibt das Feld leer, läuft die Antwort ins Leere.',
  'Your own domain': 'Deine eigene Domain',
  'Your studio’s name is on everything the automations send. This is where an answer comes back to.':
    'Auf allem, was die Automatisierungen verschicken, steht der Name deines Studios. Hierhin kommt eine Antwort zurück.',
  'Your studio’s name on what goes out, and where an answer comes back to.':
    'Der Name deines Studios auf allem, was rausgeht — und wohin eine Antwort zurückkommt.',
  // ── families ──
  Family: 'Familie',
  'My family': 'Meine Familie',
  'Add a child': 'Kind hinzufügen',
  'Add child': 'Kind anlegen',
  'Date of birth': 'Geburtsdatum',
  'Emma Klein': 'Emma Klein',
  'Booking for': 'Buchen für',
  'Book for them': 'Für sie buchen',
  'Added — see My classes.': 'Eingetragen — siehe Meine Kurse.',
  'Children this person may book and pay for.':
    'Kinder, für die diese Person buchen und zahlen darf.',
  'Kids’ classes are grouped by age.': 'Kinderkurse sind nach Alter gruppiert.',
  'Everything your children are booked into.':
    'Alles, wofür deine Kinder eingetragen sind.',
  'Anything you book for them will show up here.':
    'Alles, was du für sie buchst, erscheint hier.',
};
