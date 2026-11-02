// Whether a Fold is open belongs to this screen alone: a laptop and a phone
// signed in as the same person show one shell, and folding the notes away on
// the phone leaves them open on the laptop. Kept by name for as long as the
// page is open, so a Fold drawn again stays as it was left; until it is
// touched, it is open on a wide screen and shut on a phone.
const NARROW = '(max-width: 640px)';
const remembered = new Map<string, boolean>();

export const foldOpen = (name: string): boolean => remembered.get(name) ?? !(typeof matchMedia === 'function' && matchMedia(NARROW).matches);

export const rememberFold = (name: string, open: boolean): void => {
  remembered.set(name, open);
};
