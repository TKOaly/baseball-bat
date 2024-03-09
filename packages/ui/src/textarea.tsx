import { TextareaHTMLAttributes } from 'react';

export const Textarea: React.FC<
  TextareaHTMLAttributes<HTMLTextAreaElement>
> = ({ value, ...props }) => (
  <textarea
    className="mt-1 w-full rounded-md border-gray-200 bg-white shadow-sm"
    placeholder="Description"
    {...props}
  >
    {value}
  </textarea>
);
