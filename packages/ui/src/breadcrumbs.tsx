import { JSXElementConstructor, PropsWithChildren } from 'react';
import { ChevronsRight } from 'react-feather';

export type Segment = string | { text: string; url: string };

export type Props = {
  segments: Segment[];
  linkComponent?: JSXElementConstructor<PropsWithChildren<{ to: string }>>,
};

export const Breadcrumbs = ({
  segments,
  linkComponent: Link = ({to, children}) => <a href={to}>{children}</a>,
}: Props) => {
  return (
    <div className="flex items-center gap-1">
      {segments.flatMap((segment, i) => {
        const separator = (
          <ChevronsRight
            style={{ top: '1px', position: 'relative' }}
            className="text-gray-400"
          />
        );

        let segmentEl = null;

        if (typeof segment === 'string') {
          segmentEl = <span>{segment}</span>;
        } else {
          segmentEl = (
            <span>
              <Link to={segment.url}>{segment.text}</Link>
            </span>
          );
        }

        return i > 0 ? [separator, segmentEl] : [segmentEl];
      })}
    </div>
  );
};
