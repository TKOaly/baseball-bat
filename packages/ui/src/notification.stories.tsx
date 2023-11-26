import { Meta, StoryObj } from '@storybook/react';
import { Notification } from './notification';

export default {
  title: 'Notification',
  component: Notification,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof Notification>;

type Story = StoryObj<typeof Notification>;

const Template: StoryObj<Story> = {
  render: (args) => (
    <div className="grid grid-cols-2 gap-10">
      <Notification {...args} type="task" />
      <Notification {...args} type="info" />
      <Notification {...args} type="success" />
      <Notification {...args} type="error" />
    </div>
  ),
};

export const Default = {
  ...Template,
  args: {
    title: 'Heads up!',
    body: 'Something that you may want to know happened.',
  },
} satisfies StoryObj<typeof Notification>;

export const WithButtons = {
  ...Template,
  args: {
    title: 'Informational',
    body: 'Something that you may want to know happened.',
    buttons: [
      { id: 'a', label: 'Continue' },
      { id: 'a', label: 'Blow up' },
    ],
  },
} satisfies StoryObj<typeof Notification>;

export const WithProgress = {
  ...Template,
  args: {
    title: 'Informational',
    body: 'Something that you may want to know happened.',
    progress: 0.3,
  },
} satisfies StoryObj<typeof Notification>;

export const WithAutoDismiss = {
  ...Template,
  args: {
    title: 'Informational',
    body: 'Something that you may want to know happened.',
    dismissDuration: 5000,
  },
} satisfies StoryObj<typeof Notification>;
