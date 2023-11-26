import { Button } from './button'

export default {
  component: Button,
  title: 'Button',
  decorators: [
    (Story) => (
      <div className="flex items-center justify-center absolute inset-0">
        <div className="max-w-[20em]">
          <Story />
        </div>
      </div>
    )
  ],
};

export const Default = {
  args: {
    secondary: false,
    disabled: false,
    small: false,
    children: 'Default Button',
  },
}

export const Secondary = {
  args: {
    secondary: true,
    disabled: false,
    small: false,
    children: 'Secondary Button',
  },
}

export const Disabled = {
  args: {
    secondary: false,
    disabled: true,
    small: false,
    children: 'Disabled Button',
  },
}
