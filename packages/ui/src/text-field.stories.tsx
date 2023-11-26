import { Meta } from '@storybook/react';
import { Edit3 } from 'react-feather';
import { TextField } from './text-field';

const meta: Meta<typeof TextField> = {
  component: TextField,
  title: 'Text Field',
  decorators: [
    (Story) => (
      <div className="w-[20em]">
        <Story />
      </div>
    )
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
