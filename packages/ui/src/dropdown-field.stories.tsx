import { Meta, StoryObj } from "@storybook/react";
import { DropdownField } from "./dropdown-field";

const meta: Meta<typeof DropdownField> = {
  component: DropdownField,
  title: 'Dropdown Field',
  decorators: [
    (Story) => (
      <div className="w-[20em]">
        <Story />
      </div>
    )
  ],
};

export default meta;

const defaultStory: StoryObj<typeof DropdownField> = {
  storyName: 'Default',
  args: {
    options: [
      { text: 'Option #1', value: 1 },
      { text: 'Option #2', value: 2 },
      { text: 'Option #3', value: 3 },
    ],
  },
};

const labels: StoryObj<typeof DropdownField> = {
  storyName: 'With Labels',
  args: {
    options: [
      { text: 'Option #1', label: 'Great option', value: 1 },
      { text: 'Option #2', label: 'Even better', value: 2 },
      { text: 'Option #3', label: 'The best', value: 3 },
    ],
  },
};

const custom: StoryObj<typeof DropdownField> = {
  args: {
    options: [
      { text: 'Option #1', label: 'Great option', value: 1 },
      { text: 'Option #2', label: 'Even better', value: 2 },
      { text: 'Option #3', label: 'The best', value: 3 },
    ],
    allowCustom: true,
    createCustomOption: (input: string) => ({
      text: `${input}`,
      label: 'New!',
      value: `new`,
    })
  },
};

export { defaultStory, labels, custom }
