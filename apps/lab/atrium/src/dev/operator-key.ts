// A module of its own so admin-check can import it before `./world`: moss's
// operator gate reads the key when the runtime is built.
process.env['OPERATOR_KEY'] = 'check-operator-key';

export const OPERATOR_KEY = 'check-operator-key';
