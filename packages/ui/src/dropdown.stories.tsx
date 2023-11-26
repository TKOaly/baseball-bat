import { Meta, StoryObj } from '@storybook/react';
import { Dropdown } from './dropdown';

const meta: Meta<typeof Dropdown> = {
  title: 'Dropdown',
  component: Dropdown,
  decorators: [
    (Story) => (
      <div className="flex items-center justify-center absolute inset-0">
        <div className="w-[20em]">
          <Story />
        </div>
      </div>
    )
  ],
}

export default meta;

export const Default = {
  args: {
    label: 'Options',
    options: [
      {
        value: 1,
        text: 'Option #1',
      },
      {
        value: 2,
        text: 'Option #2',
      },
      {
        value: 3,
        text: 'Option #2',
      },
    ],
  },
} satisfies StoryObj<typeof Dropdown>;
