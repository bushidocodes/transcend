// JSX support for A-Frame custom elements (<a-scene>, <a-entity>, <a-box>, …). React treats
// unknown lowercase tags as custom elements at runtime; this teaches the type system the same
// thing for every `a-*` tag, with free-form string/number/boolean/object attribute props the
// way A-Frame component strings are written in this codebase.

import 'react';

type AframeElementProps = {
  id?: string;
  className?: string;
  children?: React.ReactNode;
  key?: React.Key;
  ref?: React.Ref<HTMLElement>;
} & Record<string, unknown>;

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      [tag: `a-${string}`]: AframeElementProps;
    }
  }
}
