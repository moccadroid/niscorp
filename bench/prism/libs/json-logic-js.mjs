import jsonLogic from 'json-logic-js';

// JsonLogic has operators that answer a primitive or an array, and none that builds an object: a rule object with
// more than one key is handed back as it is, unevaluated, and one with a single key is read as an operator.
const noObjects = 'JsonLogic has no operator that builds an object, so a rule cannot answer one (a multi-key object in a rule is returned unevaluated).';

export default {
  id: 'json-logic-js',
  name: 'JsonLogic (json-logic-js)',
  package: 'json-logic-js',
  transform: 'json',
  usesEval: false,
  prepared: false,
  notes: 'The reference JsonLogic implementation, standard operators only. No prepared form: apply walks the rule on every call, and keeps nothing between calls. A rule language, not a transform language: it cannot build an object.',
  prepare: (rule) => rule,
  run: (rule, input) => jsonLogic.apply(rule, input),
  oneShot: (rule, input) => jsonLogic.apply(rule, input),

  tasks: {
    project: { notExpressible: noObjects },
    reshape: { notExpressible: noObjects },
    strings: { notExpressible: noObjects },
    conditional: { notExpressible: noObjects },
    defaults: { notExpressible: noObjects },
    dates: { notExpressible: noObjects },
    rule: {
      source: {
        and: [
          { '==': [{ var: 'status' }, 'paid'] },
          { or: [{ '==': [{ var: 'customer.tier' }, 'gold'] }, { '>=': [{ var: 'shippingCents' }, 1000] }] },
          { some: [{ var: 'items' }, { '>=': [{ var: 'qty' }, 3] }] },
        ],
      },
    },
    totals: { notExpressible: noObjects },
    top: { notExpressible: noObjects },
    groups: { notExpressible: noObjects },
    screen: { notExpressible: noObjects },
  },
};
