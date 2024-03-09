import { Button } from './button';

export default {
  component: Button,
  title: 'Button',
  decorators: [
    Story => (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="max-w-[20em]">
          <Story />
        </div>
      </div>
    ),
  ],
};

export const Default = {
  args: {
    secondary: false,
    disabled: false,
    small: false,
    children: 'Default Button',
  },
};

export const Secondary = {
  args: {
    secondary: true,
    disabled: false,
    small: false,
    children: 'Secondary Button',
  },
};

export const Disabled = {
  args: {
    secondary: false,
    disabled: true,
    small: false,
    children: 'Disabled Button',
  },
};
