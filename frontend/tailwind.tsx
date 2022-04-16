import { ComponentType, ComponentProps } from "react";

type TailwindComponentProps<
  C extends string | React.ComponentType<any>,
  P = React.ComponentPropsWithRef<C extends keyof JSX.IntrinsicElements | React.ComponentType<any> ? C : never>
  > = P

type TailwindProxy = {
  [K in keyof JSX.IntrinsicElements]: (className: TemplateStringsArray) => ComponentType<TailwindComponentProps<K>>
}

export const tw: TailwindProxy = new Proxy({}, {
  get(target, prop, receiver) {
    return (className) => (props) => {
      const Component = prop;

      return <Component {...props} className={`${className} ${props.className}`} />;
    };
  }
});
