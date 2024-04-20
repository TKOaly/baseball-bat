import { useMemo, useRef, useCallback, useState } from 'react';
import { Breadcrumbs } from '@bbat/ui/breadcrumbs';
import { produce } from 'immer';
import * as uuid from 'uuid';
import { uid } from 'uid';
import { ResourceLink } from '../../components/resource-link';
import { EuroField } from '../../components/euro-field';
import debtCentersApi, {
  useCreateDebtCenterMutation,
  useGetDebtCenterQuery,
} from '../../api/debt-centers';
import debtApi, {
  useCreateDebtComponentMutation,
  useCreateDebtMutation,
  CreateDebtPayload,
} from '../../api/debt';
import { Button } from '@bbat/ui/button';
import * as euro from '@bbat/common/src/currency';
import { EuroValue } from '@bbat/common/src/currency';
import { isMatch } from 'date-fns/isMatch';
import { parse } from 'date-fns/parse';
import { format } from 'date-fns/format';
import { isValid } from 'date-fns/isValid';
import { useGetAccountingPeriodsQuery } from '../../api/accounting';
import { useAppSelector } from '../../store';
import {
  ColumnType,
  EditableTable,
  RowHandle,
  TableRef,
} from '../../components/editable-table';
import payersApi from '../../api/payers';
import {
  NewDebtTag,
  PayerIdentity,
  dbDateString,
} from '@bbat/common/src/types';
import * as E from 'fp-ts/Either';
import { CheckSquare, ExternalLink, Square } from 'react-feather';
import { skipToken } from '@reduxjs/toolkit/query';
import { pipe } from 'fp-ts/function';
import * as t from 'io-ts';
import { useDialog } from '../../components/dialog';
import { CustomComponentColumnDialog } from '../../components/dialogs/custom-component-column-dialog';

const errorResponse = t.type({
  message: t.string,
});

const parseDate = (v: string) => {
  let date = parse(v, 'd.M.y', new Date());

  if (!isValid(date)) {
    date = parse(v, 'y-M-d', new Date());
  }

  if (!isValid(date)) {
    return null;
  }

  return format(date, 'yyyy-MM-dd');
};

const parseEuros = (v: string): EuroValue => {
  const [euros, centsPart] = v.replace(/€$/, '').trim().split(/[,.]/, 2);

  if (centsPart && centsPart.length > 2) {
    throw 'Only up to 2 decimal places allowed in the amount column.';
  }

  return euro.add(
    euro.euro(parseInt(euros, 10)),
    euro.cents(parseInt(centsPart.padEnd(2, '0'), 10)),
  );
};

type Props = {
  debtCenterId?: string;
};

type CustomComponentDef = {
  key: string;
  name: string;
  amount: EuroValue;
};

export const MassCreateDebts = ({ debtCenterId }: Props) => {
  const { data: debtCenter } = useGetDebtCenterQuery(debtCenterId ?? skipToken);
  const { data: accountingPeriods } = useGetAccountingPeriodsQuery();
  const [getDebtComponentsByCenter] =
    debtApi.endpoints.getDebtComponentsByCenter.useLazyQuery();
  const activeAccountingPeriod = useAppSelector(
    state => state.accountingPeriod.activePeriod,
  );
  const [getPayerByEmail] = payersApi.endpoints.getPayerByEmail.useLazyQuery();
  const [getDebtCenters] =
    debtCentersApi.endpoints.getDebtCenters.useLazyQuery();
  const [createPayer] = payersApi.endpoints.createPayer.useMutation();
  const [createDebtMutation] = useCreateDebtMutation();
  const [createDebtComponent] = useCreateDebtComponentMutation();
  const [createDebtCenter] = useCreateDebtCenterMutation();

  const tableRef = useRef<TableRef>();

  const validateEmail = useCallback(
    async (value: string) => {
      if (value.indexOf('@') === -1) {
        return 'Invalid email address.';
      }

      try {
        const { isError } = await getPayerByEmail(value);

        if (isError) {
          return 'Email not found.';
        } else {
          return null;
        }
      } catch (err) {
        return 'Email not found.';
      }
    },
    [getPayerByEmail],
  );

  const validateDebtCenter = useCallback(async (value: string) => {
    const { data } = await getDebtCenters();

    const match = data?.find(c => c.name === value || c.id === value);

    if (!match) {
      return 'Debt center will be created!';
    }

    return null;
  }, []);

  const customComponentPrompt = useDialog(CustomComponentColumnDialog);

  const [customComponents, setCustomComponents] = useState<
    CustomComponentDef[]
  >([]);

  const [columnTypes, setColumnTypes] = useState<Array<ColumnType>>([
    {
      key: 'payment-condition',
      label: 'Payment Condition',
      validate: (value, row) => {
        try {
          parseInt(value, 10);
        } catch (err) {
          return 'Must be an integer.';
        }

        if (row.columns['due-date']) {
          return 'Cannot specify both a due date and a payment condition!';
        }

        return null;
      },
    },
    {
      key: 'date',
      label: 'Date',
    },
    {
      key: 'payer-name',
      label: 'Payer name',
      validate: async (value, row) => {
        const email = row.columns.email;

        if (!email) {
          return null;
        }

        const { data } = await getPayerByEmail(email);

        if (!data) {
          return null;
        }

        if (data.name !== value) {
          return {
            type: 'info',
            message: 'Name differs from the one on record: ' + data.name,
          };
        }

        return null;
      },
    },
    {
      key: 'created-debt',
      label: 'Created Debt',
      readOnly: true,
      allowSelection: false,
      render: value => (value ? <ResourceLink type="debt" id={value} /> : null),
    },
    {
      key: 'created-payer',
      label: 'Created Payer',
      readOnly: true,
      allowSelection: false,
      render: value =>
        value ? <ResourceLink type="payer" id={value} /> : null,
    },
    {
      key: 'title',
      label: 'Title',
    },
    {
      key: 'description',
      label: 'Description',
    },
    {
      key: 'debt-center',
      label: 'Debt Center',
      aliases: ['Debt Center ID'],
      validate: validateDebtCenter,
    },
    {
      key: 'accounting-period',
      label: 'Accounting Period',
      align: 'right',
    },
    {
      key: 'due-date',
      label: 'Due date',
      align: 'right',
      validate: (value, row) => {
        if (!isMatch(value, 'd.M.y')) {
          return 'Dates must be in the dd.MM.yyyy format';
        }

        if (row.columns['payment-condition']) {
          return 'Cannot specify both a due date and a payment condition!';
        }

        return null;
      },
    },
    {
      key: 'email',
      label: 'Email',
      validate: validateEmail,
    },
    {
      key: 'reference',
      label: 'Reference number',
      align: 'right',
    },
    {
      key: 'tags',
      label: 'Tags',
      render: value => (
        <div className="flex gap-1">
          {value
            .split(',')
            .map(tag => tag.trim())
            .map(tag => (
              <span
                className="rounded-md bg-gray-200 px-1 text-gray-800"
                key={tag}
              >
                {tag}
              </span>
            ))}
        </div>
      ),
    },
    {
      key: 'amount',
      label: 'Amount',
      align: 'right',
      input: (props: any) => (
        <EuroField {...props} plain style={{ lineHeight: '1em' }} />
      ),
    },
    {
      key: 'component',
      label: 'Custom component...',
      onSelect: async () => {
        const key = `custom-${uid()}`;

        const result = await customComponentPrompt({});

        if (!result) {
          return null;
        }

        const { name, amount } = result;

        setColumnTypes(types =>
          produce(types, draft => {
            draft.splice(draft.length - 1, 0, {
              key,
              label: `Component: ${name}`,
              render: value => (
                <div className="absolute inset-0 flex items-center justify-end px-1">
                  {value ? (
                    <CheckSquare className="h-4 w-4 text-green-500" />
                  ) : (
                    <Square className="h-4 w-4 text-red-500" />
                  )}
                </div>
              ),
            });
          }),
        );

        setCustomComponents(components => [
          ...components,
          {
            key,
            name,
            amount,
          },
        ]);

        return key;
      },
    },
  ]);

  const resolvePayer = useCallback(
    async (row: RowHandle, dryRun: boolean): Promise<PayerIdentity | null> => {
      const email = row.columns['email'];
      const name = row.columns['payer-name'];

      if (!email) {
        row.setRowAnnotation({
          id: 'create-debt',
          type: 'error',
          message: 'Payer email is required!',
        });

        return null;
      }

      if (!name) {
        row.setRowAnnotation({
          id: 'create-debt',
          type: 'error',
          message: 'Payer name is required!',
        });

        return null;
      }

      const { data, isError } = await getPayerByEmail(email);

      if (!isError && data) {
        return data.id;
      }

      if (dryRun) {
        return null;
      }

      const result = await createPayer({
        name,
        email,
      });

      if ('error' in result) {
        row.setRowAnnotation({
          id: 'create-debt',
          type: 'error',
          message: 'Failed to create payer profile',
        });

        return null;
      }

      return result.data.id;
    },
    [createPayer, getPayerByEmail],
  );

  const resolveDebtCenter = useCallback(
    async (
      row: RowHandle,
      accountingPeriod: number,
      dryRun: boolean,
    ): Promise<string | null> => {
      const debtCenter = row.columns['debt-center'];

      if (!debtCenter) {
        row.setRowAnnotation({
          id: 'create-debt',
          type: 'error',
          message: 'Debt center is required!',
        });

        return null;
      }

      try {
        uuid.parse(debtCenter);
        return debtCenter;
      } catch (err) {
        if (err instanceof TypeError) {
          const { data: debtCenters } = await getDebtCenters();

          if (!debtCenters) {
            row.setColumnAnnotation({
              column: 'debt-center',
              annotation: {
                id: 'create-debt',
                type: 'error',
                message: 'Failed to fetch debt centers.',
              },
            });

            return null;
          }

          const center = debtCenters.find(dc => dc.name === debtCenter);

          if (center) {
            return center.id;
          }

          if (dryRun) {
            return null;
          }

          const result = await createDebtCenter({
            accountingPeriod,
            name: debtCenter,
            description: '',
            url: '',
          });

          if ('data' in result) {
            return result.data.id;
          }

          row.setColumnAnnotation({
            column: 'debt-center',
            annotation: {
              id: 'create-debt',
              type: 'error',
              message: 'Failed to create debt center!',
            },
          });

          return null;
        } else {
          throw err;
        }
      }
    },
    [],
  );

  const batchTag = useMemo<NewDebtTag>(
    () => ({
      name: `mass-import-batch-${uid()}`,
      hidden: true,
    }),
    [],
  );

  const componentRef = useRef<Map<string, string>>(new Map());

  const resolveDebtComponent = useCallback(
    async (
      dryRun: boolean,
      options: { name: string; amount: EuroValue; debtCenterId: string },
    ) => {
      const key = `${options.debtCenterId}|${options.name}|${options.amount.value}`;
      const existing = componentRef.current.get(key);

      if (existing) {
        return existing;
      }

      const centerComponents = await getDebtComponentsByCenter(
        options.debtCenterId,
      );

      if (centerComponents.data) {
        const match = centerComponents.data.find(
          ({ name, amount }) =>
            name === options.name &&
            euro.compareEuroValues(amount, options.amount) === 0,
        );

        if (match) {
          componentRef.current.set(key, match.id);
          return match.id;
        }
      }

      if (dryRun) {
        return uid();
      }

      const result = await createDebtComponent({
        ...options,
        description: '',
      });

      if ('error' in result) {
        return null;
      }

      componentRef.current.set(key, result.data.id);

      return result.data.id;
    },
    [componentRef],
  );

  const resolveDebtRow = useCallback(
    async (
      row: RowHandle,
      dryRun: boolean,
    ): Promise<CreateDebtPayload | null> => {
      let failed = false;

      let accountingPeriod: null | number = null;

      if (!row.columns['accounting-period']) {
        accountingPeriod = activeAccountingPeriod;
      } else {
        const accountingPeriodValue = row.columns['accounting-period'];

        if (!accountingPeriodValue) {
          row.setRowAnnotation({
            type: 'error',
            id: 'create-debt',
            message: 'Accounting period is required.',
          });

          failed = true;
        } else {
          try {
            accountingPeriod = parseInt(accountingPeriodValue, 10);
          } catch (err) {
            row.setColumnAnnotation({
              column: 'accounting-period',
              annotation: {
                type: 'error',
                id: 'create-debt',
                message: 'Accounting period needs to be a valid year.',
              },
            });

            failed = true;
          }
        }
      }

      const debtCenterId = await resolveDebtCenter(
        row,
        accountingPeriod as number,
        dryRun,
      );

      if (!debtCenterId) {
        failed = true;
      }

      const payerId = await resolvePayer(row, dryRun);

      if (!payerId) {
        failed = true;
      }

      const title = row.columns.title;

      if (!title) {
        row.setRowAnnotation({
          id: 'create-debt',
          type: 'error',
          message: 'Title is required!',
        });

        failed = true;
      }

      const description = row.columns.description;

      if (!description) {
        row.setRowAnnotation({
          id: 'create-debt',
          type: 'error',
          message: 'Description is required!',
        });

        failed = true;
      }

      const hasCustomComponents = customComponents.some(
        ({ key }) => !!row.columns[key],
      );

      if (!row.columns.amount && !hasCustomComponents) {
        row.setRowAnnotation({
          id: 'create-debt',
          type: 'error',
          message: 'Debt has no monetary value!',
        });

        failed = true;
      }

      const dueDateValue = row.columns['due-date'];
      const paymentConditionValue = row.columns['payment-condition'];

      if (!dueDateValue === !paymentConditionValue) {
        row.setRowAnnotation({
          id: 'create-debt',
          type: 'error',
          message:
            'Either due date or payment condition must be defined at a time, but not both!',
        });

        failed = true;
      }

      let dueDate = null;
      let paymentCondition = null;

      if (dueDateValue) {
        dueDate = parseDate(dueDateValue);
      } else if (paymentConditionValue) {
        paymentCondition = parseInt(paymentConditionValue, 10);
      } else {
        console.error('Reached unreachable code!');
        return null;
      }

      const tags: NewDebtTag[] = [batchTag];

      if (row.columns.tags) {
        tags.push(
          ...row.columns.tags
            .split(',')
            .map((tag: string) => tag.trim())
            .map((name: string) => ({ name, hidden: false })),
        );
      }

      const amountValue = row.columns.amount;
      let amount: EuroValue | null = null;

      if (amountValue) {
        amount = parseEuros(amountValue);
      }

      if (failed || !debtCenterId) {
        return null;
      }

      const components: string[] = [];

      for (const { key, name, amount } of customComponents) {
        if (!row.columns[key]) {
          continue;
        }

        const component = await resolveDebtComponent(dryRun, {
          debtCenterId,
          name,
          amount,
        });

        if (!component) {
          row.setRowAnnotation({
            type: 'error',
            id: 'create-debt',
            message: 'Failed to create debt contents!',
          });

          return null;
        } else {
          components.push(component);
        }
      }

      if (amount) {
        const component = await resolveDebtComponent(dryRun, {
          debtCenterId,
          name: 'Osallistumismaksu // Participation fee',
          amount,
        });

        if (!component) {
          row.setRowAnnotation({
            type: 'error',
            id: 'create-debt',
            message: 'Failed to create debt contents!',
          });

          return null;
        }

        components.push(component);
      }

      if (failed) {
        return null;
      }

      const parseDueDate = (dueDate: string) => {
        const parsed = dbDateString.decode(dueDate);

        if (E.isRight(parsed)) {
          return parsed.right;
        } else {
          return null;
        }
      };

      return {
        payer: payerId!,
        center: debtCenterId,
        name: title!,
        description: description!,
        accountingPeriod: accountingPeriod!,
        dueDate: (dueDate && parseDueDate(dueDate)) || null,
        paymentCondition: paymentCondition ?? null,
        tags,
        components,
        defaultPayment: {
          type: 'invoice',
          options: {
            referenceNumber: row.columns['reference'],
          },
        },
      };
    },
    [
      resolveDebtCenter,
      accountingPeriods,
      activeAccountingPeriod,
      batchTag,
      customComponents,
      resolveDebtComponent,
    ],
  );

  const createDebt = useCallback(
    async (row: RowHandle) => {
      /*if (row.isLocked()) {
      return;
    }*/

      row.setLocked(true);

      row.clearRowAnnotation({
        id: 'debt-center',
      });

      row.clearColumnAnnotation({
        id: 'debt-center',
      });

      const debtDetails = await resolveDebtRow(row, false);

      if (!debtDetails) {
        row.setLocked(false);
        return;
      }

      const result = await createDebtMutation(debtDetails);

      if ('data' in result) {
        row.columns['created-debt'] = result.data.id;
        row.setRowAnnotation({
          id: 'create-debt',
          type: 'info',
          message: `Debt ${result.data.humanId} created!`,
        });
      } else {
        const message = pipe(
          errorResponse.decode(result.error),
          E.map(response => response.message),
          E.getOrElse(() => 'Unknown error occurred while creating the debt!'),
        );

        row.setRowAnnotation({
          id: 'create-debt',
          type: 'error',
          message,
        });

        row.setLocked(false);
      }
    },
    [createDebtMutation, resolveDebtRow],
  );

  const validateRow = useCallback(
    async (row: RowHandle) => {
      /*const payerEmail = row.columns.email;
    const payerName = row.columns['payer-name'];

    let errors = [];

    const { data } = await getPayerByEmail(payerEmail);

    if (!data && !payerName) {
      errors.push('Payer name needed for profile creation');
    }

    if (!row.columns.title) {
      errors.push('Debt title must be defined!');
    }

    if (!row.columns.description) {
      errors.push('Debt description must be provided!');
    }

    if (!row.columns['debt-center']) {
      errors.push('Debt center must be provided');
    }

    if (!row.columns['accounting-period']) {
      errors.push('Accounting period must be specified');
    } else {
      const { data } = await getAccountingPeriods();

      const match = data.find(({ year }) => year === parseInt(row.columns['accounting-period'], 10));

      if (!match) {
        errors.push({
          column: 'accounting-period',
          message: 'Accounting period not found',
        });
      } else if (match.closed) {
        errors.push({
          column: 'accounting-period',
          message: 'Accounting period closed',
        });
      }
    }

    return errors;*/
      row.clearRowAnnotation({
        id: 'create-debt',
      });

      row.clearColumnAnnotation({
        id: 'create-debt',
      });

      resolveDebtRow(row, true);

      return [];
    },
    [resolveDebtRow],
  );

  const rowActions = useMemo(
    () => [
      {
        key: 'create-debt',
        label: 'Create Debt',
        execute: async (row: RowHandle) => {
          if (!row.isLocked()) {
            await createDebt(row);
          }
        },
      },
    ],
    [createDebt],
  );

  return (
    <div>
      <h1 className="mb-5 mt-10 text-2xl">
        <Breadcrumbs
          segments={[
            {
              text: 'Debt Centers',
              url: '/admin/debt-centers',
            },
            {
              text: debtCenter?.name ?? '...',
              url: `/admin/debt-centers/${debtCenterId}`,
            },
            'Mass Create Debts',
          ]}
        />
      </h1>
      <p>
        <div className="space-x-4">
          <Button
            onClick={async () => {
              if (tableRef.current) {
                const rows = [...tableRef.current.getRowIterator()];

                rows.forEach(row => {
                  row.setLocked(true);
                  row.setRowAnnotation({
                    id: 'create-debt-loading',
                    type: 'loading',
                    message: 'Waiting...',
                  });
                });

                for (const row of tableRef.current.getRowIterator()) {
                  row.setRowAnnotation({
                    id: 'create-debt-loading',
                    type: 'loading',
                    message: 'Creating debt...',
                  });

                  try {
                    await createDebt(row);
                  } finally {
                    row.setLocked(false);
                    row.clearRowAnnotation({
                      id: 'create-debt-loading',
                    });
                  }
                }
              }
            }}
          >
            Create Debts
          </Button>
          <Button
            secondary
            onClick={() => {
              window.open(
                `/admin/debts?tag=${encodeURIComponent(batchTag.name)}`,
                '_blank',
                'noreferrer',
              );
            }}
          >
            View created <ExternalLink className="ml-0.5 h-4 w-4" />
          </Button>
        </div>

        <div>
          <EditableTable
            ref={tableRef}
            columnTypes={columnTypes}
            validateRow={validateRow}
            rowActions={rowActions}
          />
        </div>
      </p>
    </div>
  );
};
