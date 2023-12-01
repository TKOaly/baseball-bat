import { Meta, StoryObj } from '@storybook/react';
import { Table } from './table';

export default {
  component: Table,
  title: 'Table',
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof Table>;

type Story = StoryObj<typeof Table>;

export const Default = {
  args: {
    rows: [
      {
        key: '1',
        id: 'CMPY-0001',
        name: 'McGlynn Group',
        employees: 46,
        field: 'Electronics',
      } as any,
      {
        key: '2',
        id: 'CMPY-0002',
        name: "Batz-O'Conner",
        employees: 83,
        field: 'Pharmaseuticals',
      } as any,
      {
        key: '3',
        id: 'CMPY-0003',
        name: 'Price-Mohr',
        employees: 13,
        field: 'Electronics',
      } as any,
      {
        key: '4',
        id: 'CMPY-0004',
        name: 'Spencer-Rutherford',
        employees: 134,
        field: 'Pharmaseuticals',
      } as any,
      {
        key: '5',
        id: 'CMPY-0005',
        name: 'Weber-Torp',
        employees: 26,
        field: 'Manufacturing',
      } as any,
    ],
    columns: [
      {
        name: 'ID',
        getValue: 'id',
      },
      {
        name: 'Name',
        getValue: 'name',
      },
      {
        name: 'Employees',
        getValue: 'employees',
      },
      {
        name: 'Field',
        getValue: 'field',
      },
    ],
    selectable: false,
  },
} satisfies Story;
