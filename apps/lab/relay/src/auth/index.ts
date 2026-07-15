// Auth, clearly separate: username → fake magic link → token. The app
// consumes `identity()` and `subscribe()`; the login action calls the fns.
// Nothing else in the app knows how sign-in works.
export { identity, signIn, signOut, subscribe, type Identity } from './session';
export { mintToken, decodeToken, type Token } from './token';
export { authFunctions } from './fns';
export { USERS, userByUsername, type AuthUser } from './users';
