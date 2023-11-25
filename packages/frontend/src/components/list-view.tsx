import { PropsWithChildren, ReactNode, useState } from 'react';
import { ButtonGroupSelector } from '../components/button-group-selector';

const ListViewCardContainer = ({
  className,
  ...props
}: PropsWithChildren<HTMLDivElement>) => (
  <div
    className={`
  rounded-md
  p-5
  bg-white
  shadow-sm
  border
  border-gray-100
  hover:border
  hover:border-yellow-300
  cursor-pointer
  hover:shadow-sm ${className}`}
    {...props}
  />
);

const ListViewRowContainer = ({
  className,
  ...props
}: PropsWithChildren<HTMLDivElement>) => (
  <div
    className={`
  rounded-md
  gap-3
  px-5
  py-3
  flex
  bg-white
  shadow-sm
  border
  hover:border
  hover:border-blue-200
  cursor-pointer
  hover:shadow-sm
  items-center ${className}`}
    {...props}
  />
);

interface BadgeProps {
  label: string;
  color: 'blue' | 'green';
}

interface ListViewItem {
  key: string;
  title: string;
  description: string;
  label: string;
  badges: BadgeProps[];
}

interface ListViewItemProps {
  item: ListViewItem;
  onSelected: () => void;
}

const ListViewCard = ({ item, onSelected }: ListViewItemProps) => {
  const colors = {
    green: 'from-green-200 to-green-300',
    blue: 'from-blue-200 to-blue-300',
  };

  return (
    <ListViewCardContainer tabIndex={0} onClick={onSelected}>
      <div className="flex items-center mb-3">
        <h3 className="text-lg flex-grow mt-0">{item.title}</h3>
        <span className="text-gray-600 text-right">{item.label}</span>
      </div>
      <div>{item.description}</div>
      {item.badges.map(badge => (
        <span
          className={`rounded-md mr-2 bg-gradient-to-br ${
            colors[badge.color]
          } py-0.5 px-2`}
          key={badge.label}
        >
          {badge.label}
        </span>
      ))}
    </ListViewCardContainer>
  );
};

const ListViewRow = ({ item, onSelected }: ListViewItemProps) => {
  return (
    <ListViewRowContainer tabIndex={0} onClick={onSelected}>
      <h3 className="text-md mt-0">{item.title}</h3>
      <div>
        {item.badges.map(badge => (
          <span
            className={`rounded-md mr-2 bg-gradient-to-br from-${badge.color}-200 to-${badge.color}-300 py-0.5 px-2`}
            key={badge.label}
          >
            {badge.label}
          </span>
        ))}
      </div>
      <div className="flex-grow"></div>
      <span className="text-gray-600">{item.label}</span>
    </ListViewRowContainer>
  );
};

type ListViewMode = 'cards' | 'rows';

export interface Props {
  items: ListViewItem[];
  actions?: ReactNode;
  onSelected?: (item: ListViewItem) => void;
}

export const ListView = ({ items, actions, onSelected }: Props) => {
  const [mode, setMode] = useState<ListViewMode>('cards');

  const ItemComponent = mode === 'cards' ? ListViewCard : ListViewRow;

  return (
    <div>
      <div className="flex gap-2 items-center mb-5">
        {actions}
        <div className="flex-grow"></div>
        <ButtonGroupSelector
          disabled={items.length === 0}
          value={mode}
          onChange={setMode}
          options={[
            {
              text: 'Grid',
              value: 'cards' as ListViewMode,
            },
            {
              text: 'List',
              value: 'rows' as ListViewMode,
            },
          ]}
        />
      </div>

      <div
        className={`grid items-stretch grid-cols-1 ${
          mode === 'cards' ? 'lg:grid-cols-2' : 'lg:grid-cols-1'
        } gap-3 w-full`}
      >
        {items.length === 0 && (
          <ListViewCard
            item={{
              key: 'empty',
              title: 'No items',
              description: 'There are no items to display.',
              label: '',
              badges: [],
            }}
            onSelected={() => {
              return;
            }}
          />
        )}
        {items.map(item => (
          <ItemComponent
            item={item}
            key={item.key}
            onSelected={() => onSelected?.(item)}
          />
        ))}
      </div>
    </div>
  );
};
