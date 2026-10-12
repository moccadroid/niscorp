// A check imports this before `./world` and before the integrations service:
// `devRuntime` reads the key once, when it builds the runtime. Assigned rather
// than defaulted, so a key in a developer's shell or `.env` cannot stand in.
process.env['OPERATOR_KEY'] = 'lab-operator-key';

export const OPERATOR_KEY = 'lab-operator-key';
