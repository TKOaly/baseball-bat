import { HTMLAttributes, ReactNode, useState } from 'react';
import { ButtonGroupSelector } from '../components/button-group-selector';

const ListViewCardContainer = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={`
      cursor-pointer
      rounded-md
      border
      border-gray-100
      bg-white
      p-5
      shadow-sm
      hover:border
      hover:border-yellow-300
      hover:shadow-sm
      ${className}
    `}
    {...props}
  />
);

const ListViewRowContainer = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={`
      flex
      cursor-pointer
      items-center
      gap-3
      rounded-md
      border
      bg-white
      px-5
      py-3
      shadow-sm
      hover:border
      hover:border-blue-200
      hover:shadow-sm
      ${className}
    `}
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
      <div className="mb-3 flex items-center">
        <h3 className="mt-0 flex-grow text-lg">{item.title}</h3>
        <span className="text-right text-gray-600">{item.label}</span>
      </div>
      <div>{item.description}</div>
      {item.badges.map(badge => (
        <span
          className={`mr-2 rounded-md bg-gradient-to-br ${
            colors[badge.color]
          } px-2 py-0.5`}
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
            className={`mr-2 rounded-md bg-gradient-to-br from-${badge.color}-200 to-${badge.color}-300 px-2 py-0.5`}
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
      <div className="mb-5 flex items-center gap-2">
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
        className={`grid grid-cols-1 items-stretch ${
          mode === 'cards' ? 'lg:grid-cols-2' : 'lg:grid-cols-1'
        } w-full gap-3`}
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
