import { Meta, StoryObj } from '@storybook/react';
import { DateField } from './datetime-field';

export default {
  title: 'Date Field',
  component: DateField,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof DateField>;

type Story = StoryObj<typeof DateField>;

export const Default: Story = {
  args: {
    value: '2022-10-21',
    format: 'y-m-d',
  },
};
