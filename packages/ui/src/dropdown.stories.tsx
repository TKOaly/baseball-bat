import { Meta, StoryObj } from '@storybook/react';
import { Dropdown, DropdownItem } from './dropdown';

const meta: Meta<typeof Dropdown> = {
  title: 'Dropdown',
  component: Dropdown,
  decorators: [
    Story => (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-[20em]">
          <Story />
        </div>
      </div>
    ),
  ],
};

export default meta;

export const Default = {
  args: {
    label: 'Options',
    flat: false,
    children: [
      <DropdownItem label="Option #1" />,
      <DropdownItem label="Option #2" />,
      <DropdownItem label="Option #3" />,
    ],
  },
} satisfies StoryObj<typeof Dropdown>;

export const Nested = {
  args: {
    label: 'Options',
    flat: false,
    children: [
      <Dropdown label="Option #1">
        <DropdownItem label="Option #1.1" />
        <DropdownItem label="Option #1.2" />
        <DropdownItem label="Option #1.3" />
      </Dropdown>,
      <Dropdown searchable label="Option #2">
        {new Array(100).fill(true).map((_, i) => (
          <DropdownItem
            label={`Option #2.${i + 1}`}
            aside={i % 2 === 0 ? 'Even' : undefined}
          />
        ))}
      </Dropdown>,
      <DropdownItem label="Option #3" />,
    ],
  },
} satisfies StoryObj<typeof Dropdown>;
