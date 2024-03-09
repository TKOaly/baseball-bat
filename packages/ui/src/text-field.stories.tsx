import { Meta, StoryObj } from '@storybook/react';
import { Edit3 } from 'react-feather';
import { TextField } from './text-field';

const meta: Meta<typeof TextField> = {
  component: TextField,
  title: 'Text Field',
  decorators: [
    Story => (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex max-w-[20em]">
          <Story />
        </div>
      </div>
    ),
  ],
};

export default meta;

export const Default = {
  args: {},
};

export const WithIcon = {
  args: {
    iconRight: <Edit3 />,
  },
};

export const WithError = {
  args: {
    error: true,
  },
};

export const FlushSides = {
  render: args => (
    <div className="flex">
      <TextField {...args} flushRight placeholder="Left" />
      <TextField {...args} flushLeft flushRight placeholder="Center" />
      <TextField {...args} flushLeft placeholder="Right" />
    </div>
  ),
} satisfies StoryObj<typeof TextField>;
