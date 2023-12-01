import { Meta, StoryObj } from '@storybook/react';
import { Breadcrumbs } from './breadcrumbs';

export default {
  title: 'Breadcrumbs',
  component: Breadcrumbs,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof Breadcrumbs>;

type Story = StoryObj<typeof Breadcrumbs>;

export const Default = {
  args: {
    segments: [
      { text: 'App', url: '#' },
      { text: 'Settings', url: '#' },
      { text: 'Security', url: '#' },
    ],
  },
} satisfies Story;
