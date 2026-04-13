// ═══════════════════════════════════════════════════════════
// TypedTopic — phantom-typed bus topic descriptor
// ═══════════════════════════════════════════════════════════
//
// A TypedTopic<T> is a string that carries a phantom type T
// representing the payload shape for that topic. The bus uses
// it to infer payload types at emit/on call sites.
//
// Usage:
//   const myTopic = topic<{ score: number }>('myapp.score');
//   bus.emit(myTopic, { score: 0.8 });  // type-checked
//   bus.on(myTopic, (e) => e.payload.score); // inferred
//
// Plain strings still work — they produce `unknown` payloads.
// TypedTopic is opt-in type safety, not a requirement.

// The phantom brand. Never constructed at runtime — exists only
// in the type system so TypedTopic<A> !== TypedTopic<B>.
declare const PAYLOAD_BRAND: unique symbol;

export type TypedTopic<T> = string & { readonly [PAYLOAD_BRAND]: T };

export const topic = <T>(name: string): TypedTopic<T> =>
  name as TypedTopic<T>;
