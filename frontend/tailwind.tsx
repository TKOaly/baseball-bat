import React from 'react';

type TailwindComponentProps<
  C extends string | React.ComponentType<any>, // eslint-disable-line
  P = React.ComponentPropsWithRef<C extends keyof JSX.IntrinsicElements | React.ComponentType<any> ? C : never> // eslint-disable-line
  > = P

type TailwindProxy = {
  [K in keyof JSX.IntrinsicElements]: (className: TemplateStringsArray) => React.FC<TailwindComponentProps<K>>
}

export const tw: TailwindProxy = new Proxy({}, {
  get: <P extends keyof JSX.IntrinsicElements>(_target: TailwindProxy, prop: P) => {
    return (className: string) => (props: JSX.IntrinsicElements[P]) => { // eslint-disable-line
      const Component: string = prop;

      return <Component {...Object.assign({}, props, { className: `${className} ${props.className}` })} />;
    };
  },
}) as any; // eslint-disable-line
