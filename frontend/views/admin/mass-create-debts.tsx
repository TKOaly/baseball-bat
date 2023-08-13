import { useMemo, useRef, useCallback } from 'react';
import { Breadcrumbs } from '../../components/breadcrumbs';
import uuid from 'uuid'; 
import { ResourceLink } from '../../components/resource-link';
import { EuroField } from '../../components/euro-field';
import debtCentersApi, { useGetDebtCenterQuery } from '../../api/debt-centers';
import { useCreateDebtComponentMutation, useCreateDebtMutation, CreateDebtPayload } from '../../api/debt';
import { Button } from '../../components/button';
import { cents, EuroValue } from '../../../common/currency';
import { isMatch } from 'date-fns';
import accountingApi, { useGetAccountingPeriodsQuery } from '../../api/accounting';
import { useAppSelector } from '../../store';
import { ColumnType, EditableTable, TableRef } from '../../components/editable-table';
import payersApi from '../../api/payers';
import { PayerIdentity } from '../../../common/types';

const parseDate = (v: string) => v;

const parseEuros = (v: string): EuroValue => {
  const [euros, centsPart] = v.replace(/€$/, '').trim().split(/[,.]/, 2);

  if (centsPart && centsPart.length > 2) {
    throw 'Only up to 2 decimal places allowed in the amount column.';
  }

  return cents(parseInt(euros) * 100 + (centsPart ? parseInt(centsPart) : 0));
};

export const MassCreateDebts = ({ params }) => {
  const debtCenterId = params.id;

  const { data: debtCenter } = useGetDebtCenterQuery(debtCenterId);
  const { data: accountingPeriods } = useGetAccountingPeriodsQuery();
  const activeAccountingPeriod = useAppSelector((state) => state.accountingPeriod.activePeriod);
  const [getPayerByEmail] = payersApi.endpoints.getPayerByEmail.useLazyQuery();
  const [getDebtCenters] = debtCentersApi.endpoints.getDebtCenters.useLazyQuery();
  const [createPayer] = payersApi.endpoints.createPayer.useMutation();
  const [getAccountingPeriods] = accountingApi.endpoints.getAccountingPeriods.useLazyQuery();
  const [createDebtMutation] = useCreateDebtMutation();
  const [createDebtComponent] = useCreateDebtComponentMutation();

  const tableRef = useRef<TableRef>();

  const validateEmail = useCallback(async (value: string) => {
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
  }, [getPayerByEmail]);

  const validateDebtCenter = useCallback(async (value: string) => {
    const { data } = await getDebtCenters();

    const match = data.find((c) => c.name === value || c.id === value);

    if (!match) {
      return 'Debt center will be created!';
    }

    return null;
  }, []);

  const columnTypes = useMemo<Array<ColumnType>>(() => [
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
          return { type: 'info', message: 'Name differs from the one on record: ' + data.name };
        }

        return null;
      },
    },
    {
      key: 'created-debt',
      label: 'Created Debt',
      readOnly: true,
      allowSelection: false,
      render: (value) => value ? <ResourceLink type="debt" id={value} /> : null,
    },
    {
      key: 'created-payer',
      label: 'Created Payer',
      readOnly: true,
      allowSelection: false,
      render: (value) => value ? <ResourceLink type="payer" id={value} /> : null,
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
        if (!isMatch(value, 'dd.MM.yyyy')) {
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
      key: 'amount',
      label: 'Amount',
      align: 'right',
      input: (props: any) => <EuroField {...props} plain style={{ lineHeight: '1em' }} />,
    }
  ], [validateEmail]);

  const resolvePayer = useCallback(async (row): Promise<PayerIdentity | null> => {
    const email = row.columns['email'];
    const name = row.columns['payer-name'];

    if (!email) {
      row.setColumnAnnotation({
        column: 'email',
        annotation: {
          id: 'create-debt',
          type: 'error',
          message: 'Payer email is required!',
        },
      });

      return null;
    }

    const { data, isError } = await getPayerByEmail(email);

    if (!isError) {
      return data.id;
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
  }, [createPayer, getPayerByEmail]);

  const resolveDebtCenter = useCallback(async (row): Promise<string | null> => {
    const debtCenter = row.columns['debt-center'];

    if (!debtCenter) {
      row.setColumnAnnotation({
        column: 'debt-center',
        annotation: {
          id: 'create-debt',
          type: 'error',
          message: 'Debt center is required!',
        },
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

        const center = debtCenters.find((dc) => dc.name === debtCenter);

        if (!center) {
          row.setColumnAnnotation({
            column: 'debt-center',
            annotation: {
              id: 'create-debt',
              type: 'error',
              message: 'No such debt center!',
            },
          });

          return null;
        }

        return center.id;
      } else {
        throw err;
      }
    }
  }, []);

  const resolveDebtRow = useCallback(async (row): Promise<CreateDebtPayload | null> => {
    let failed = false;
    const debtCenterId = await resolveDebtCenter(row);

    if (!debtCenterId) {
      return null;
    }

    const payerId = await resolvePayer(row);

    if (!payerId) {
      return null;
    }

    const title = row.columns.title;

    if (!title) {
      row.setColumnAnnotation({
        column: 'title',
        annotation: {
          id: 'create-debt',
          type: 'error',
          message: 'Title is required!',
        },
      });

      failed = true;
    }

    const description = row.columns.description;

    if (!description) {
      row.setColumnAnnotation({
        column: 'description',
        annotation: {
          id: 'create-debt',
          type: 'error',
          message: 'Description is required!',
        },
      });

      failed = true;
    }

    if (!row.columns.amount) {
      row.setColumnAnnotation({
        column: 'amount',
        annotation: {
          id: 'create-debt',
          type: 'error',
          message: 'Amount is required!',
        },
      });

      failed = true;
    }

    if (failed) {
      return null;
    }

    let accountingPeriod: null | number = null;

    if (!row.columns['accounting-period']) {
      accountingPeriod = activeAccountingPeriod;
    } else {
      const accountingPeriodValue = row.columns['accounting-period'];

      if (!accountingPeriodValue) {
        row.setColumnAnnotation({
          column: 'accounting-period',
          annotations: {
            type: 'error',
            id: 'create-debt',
            message: 'Accounting period is required.',
          },
        });

        failed = true;
      } else {
        try {
          accountingPeriod = parseInt(accountingPeriodValue, 10);
        } catch (err) {
          row.setColumnAnnotation({
            column: 'accounting-period',
            annotations: {
              type: 'error',
              id: 'create-debt',
              message: 'Accounting period needs to be a valid year.',
            },
          });

          failed = true;
        }
      }
    }

    const dueDateValue = row.columns['due-date'];
    const paymentConditionValue = row.columns['payment-condition'];

    if (!dueDateValue === !paymentConditionValue) {
      row.setRowAnnotation({
        id: 'create-debt',
        type: 'error',
        message: 'Either due date or payment condition must be defined at a time, but not both!',
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

    const amountValue = row.columns.amount;
    let amount: EuroValue;

    if (!amountValue) {
      row.setColumnAnnotation({
        column: 'amount',
        annotation: {
          id: 'create-debt',
          type: 'error',
          message: 'Amount is required!',
        },
      });

      failed = true;
    } else {
      amount = parseEuros(amountValue);
    }

    const componentResult = await createDebtComponent({
      debtCenterId,
      name: 'Osallistumismaksu // Participation fee',
      description: '',
      amount,
    });

    if ('error' in componentResult) {
      row.setRowAnnotation({
        type: 'error',
        id: 'create-debt',
        message: 'Failed to create debt contents!',
      });

      return null;
    }

    if (failed) {
      return null;
    }

    return {
      payer: payerId,
      center: debtCenterId,
      name: title,
      description,
      accountingPeriod,
      dueDate: dueDate ?? undefined,
      paymentCondition: paymentCondition ?? undefined,
      tags: [],
      components: [componentResult.data.id],
    };
  }, [resolveDebtCenter, accountingPeriods, activeAccountingPeriod]);

  const createDebt = useCallback(async (row) => {
    row.setLocked(true);

    row.clearRowAnnotation({
      annotationId: 'debt-center',
    });

    row.clearColumnAnnotation({
      annotationId: 'debt-center',
    });

    const debtDetails = await resolveDebtRow(row);

    if (!debtDetails) {
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
    }
  }, [createDebtMutation, resolveDebtRow]);

  const validateRow = useCallback(async (row) => {
    const payerEmail = row.columns.email;
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

    return errors;
  }, [getPayerByEmail, getAccountingPeriods]);

  const rowActions = useMemo(() => [
    {
      key: 'create-debt',
      label: 'Create Debt',
      execute: createDebt,
    },
  ], [createDebt]);

  return (
    <div>
      <h1 className="text-2xl mt-10 mb-5">
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
        <div>
          <Button
            onClick={async () => {
              if (tableRef.current) {
                const rows = [...tableRef.current.getRowIterator()];

                rows.forEach(async (row) => {
                  try {
                    if (row.isLocked()) {
                      return;
                    }

                    row.setLocked(true);
                    await createDebt(row);
                  } finally {
                    row.setLocked(false);
                  }
                });
              }
            }}
          >
            Create Debts
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
