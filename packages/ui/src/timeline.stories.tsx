import { Meta, StoryObj } from '@storybook/react';
import { Timeline } from './timeline';
import { addYears, parse } from 'date-fns';

const meta: Meta<typeof Timeline> = {
  component: Timeline,
  title: 'Timeline',
  decorators: [
    (Story) => (
      <div className="flex items-center justify-center absolute inset-0">
        <div className="w-[20em]">
          <Story />
        </div>
      </div>
    )
  ],
};

export default meta;

export const Default = {
  args: {
    events: [
      {
        time: parse('2023-05-14', 'y-m-d', new Date()),
        title: `This happended in the past.`,
      },
      {
        time: new Date(),
        title: `Something really important happens today!`,
      },
      {
        time: addYears(new Date(), 2),
        title: 'An this will be in the future.',
      },
    ],
  },
} satisfies StoryObj<typeof Timeline>;
