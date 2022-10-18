import { TextareaHTMLAttributes } from "react";

export const TextareaField: React.FC<TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ value, ...props }) => (
  <textarea className="bg-white w-full rounded-md border-gray-200 mt-1 shadow-sm" placeholder="Description" {...props}>{value}</textarea>
);

