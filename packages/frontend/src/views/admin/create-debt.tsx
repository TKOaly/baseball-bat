import { Formik } from 'formik';
import {
  useMemo,
  useCallback,
  useState,
  useEffect,
  ComponentProps,
} from 'react';
import { Breadcrumbs } from '@bbat/ui/breadcrumbs';
import * as E from 'fp-ts/lib/Either';
import { DropdownField } from '@bbat/ui/dropdown-field';
import { EuroField } from '../../components/euro-field';
import { DateField } from '@bbat/ui/datetime-field';
import {
  DbDateString,
  dbDateString,
  euro,
  EuroValue,
  InternalIdentity,
  PayerIdentity,
  PayerProfile,
  TkoalyIdentity,
  tkoalyIdentity,
  UpstreamUser,
} from '@bbat/common/src/types';
import { groupBy } from 'remeda';
import { InputGroup } from '../../components/input-group';
import { TabularFieldListFormik } from '../../components/tabular-field-list';
import { Textarea } from '@bbat/ui/textarea';
import { TextField } from '@bbat/ui/text-field';
import { useGetDebtCentersQuery } from '../../api/debt-centers';
import {
  useCreateDebtMutation,
  useGetDebtComponentsByCenterQuery,
} from '../../api/debt';
import { useGetUpstreamUsersQuery } from '../../api/upstream-users';
import { useLocation } from 'wouter';
import { isRight } from 'fp-ts/lib/Either';
import { useAppSelector } from '../../store';
import { useGetAccountingPeriodsQuery } from '../../api/accounting';
import { CreatePayerDialog } from '../../components/dialogs/create-payer-dialog';
import { useDialog } from '../../components/dialog';
import { useGetPayersQuery } from '../../api/payers';
import { uid } from 'uid';
import { skipToken } from '@reduxjs/toolkit/query';
import { pipe } from 'fp-ts/lib/function';

type DebtFormComponentValue = {
  component: string | { name: string };
  amount: EuroValue;
};

type DebtFormValues = {
  name: string;
  center: string | { name: string } | null;
  description: string;
  components: DebtFormComponentValue[];
  amount: EuroValue;
  payer: PayerIdentity | null;
  date: DbDateString | null;
  dueDate: undefined;
  paymentCondition:
    | { type: 'date'; value: string }
    | { type: 'interval'; value: number }
    | null;
  accountingPeriod: number | null;
};

export const CreateDebt = (props: { debtCenterId?: string }) => {
  const { data: users } = useGetUpstreamUsersQuery();
  const { data: payers } = useGetPayersQuery();
  const { data: debtCenters } = useGetDebtCentersQuery();
  const [debtCenterId, setDebtCenterId] = useState<null | string>(
    props.debtCenterId ?? null,
  );
  const { data: centerComponents } = useGetDebtComponentsByCenterQuery(
    debtCenterId ?? skipToken,
  );
  const [createDebt] = useCreateDebtMutation();
  const showCreatePayerDialog = useDialog(CreatePayerDialog);
  const [, setLocation] = useLocation();
  const activeAccountingPeriod = useAppSelector(
    state => state.accountingPeriod.activePeriod,
  );
  const { data: accountingPeriods } = useGetAccountingPeriodsQuery();

  const submitDebtForm = async (values: DebtFormValues) => {
    if (
      values.payer === null ||
      values.accountingPeriod === null ||
      values.center === null
    ) {
      return;
    }

    const [dueDate, paymentCondition] = (() => {
      if (values.paymentCondition?.type === 'date') {
        return pipe(
          values.paymentCondition.value,
          dbDateString.decode,
          E.foldW(
            () => [null, null] as const,
            date => [date, null] as const,
          ),
        );
      }

      if (values.paymentCondition?.type === 'interval') {
        return [null, values.paymentCondition.value] as const;
      }

      return [null, null] as const;
    })();

    const result = await createDebt({
      name: values.name,
      description: values.description,
      accountingPeriod: values.accountingPeriod,
      tags: [],
      payer: values.payer,
      date: values.date ?? undefined,
      dueDate,
      paymentCondition,
      center:
        typeof values.center === 'string'
          ? values.center
          : { name: values.center.name, url: '', description: '' },
      components: values.components.map(({ component, amount }) => {
        if (typeof component === 'string') {
          return component;
        }

        return {
          amount,
          name: component.name,
          description: '',
        };
      }),
    });

    if ('data' in result) {
      setLocation(`/admin/debts/${result.data.id}`);
    }
  };

  const createCustomPayerOption = useCallback(async (input: string) => {
    const result = await showCreatePayerDialog({ name: input });

    if (result) {
      return result.id;
    } else {
      return null;
    }
  }, []);

  const formatCustomPayerOption = useCallback(
    ({ value }: { value: string }) => value,
    [],
  );

  const payerOptions = useMemo(() => {
    const combined = [
      ...(users ?? []).map(value => ({
        type: 'tkoaly',
        key: value.id,
        id: tkoalyIdentity(value.id),
        value,
      })),
      ...(payers ?? []).map(value => ({
        type: 'internal',
        key: value.tkoalyUserId?.value,
        id: value.id,
        value,
      })),
    ] as (
      | { type: 'tkoaly'; key: string; id: TkoalyIdentity; value: UpstreamUser }
      | {
          type: 'internal';
          key: number;
          id: InternalIdentity;
          value: PayerProfile;
        }
    )[];

    const grouped = groupBy(combined, s => s.key ?? '');

    const other = grouped['null'] ?? [];
    delete grouped['null'];

    const result: ComponentProps<typeof DropdownField>['options'] =
      Object.values(grouped).map(entries => {
        const tkoaly = entries.find(
          entry => entry.type === 'tkoaly',
        ) as Extract<(typeof combined)[0], { type: 'tkoaly' }>;
        const internal = entries.find(
          entry => entry.type === 'internal',
        ) as Extract<(typeof combined)[0], { type: 'internal' }>;

        let value;
        let name;

        if (internal) {
          value = internal.id;
          name = internal.value.name;
        } else if (tkoaly) {
          value = tkoaly.id;
          name = tkoaly.value.screenName;
        } else {
          throw new Error('No suitable ID found!');
        }

        return {
          value,
          text: name,
          label: tkoaly?.value?.username ?? '',
        };
      });

    result.push(
      ...other.flatMap(other => {
        if (other.type === 'internal') {
          return [
            {
              value: other.value.id,
              text: other.value.name,
            },
          ];
        } else {
          return [];
        }
      }),
    );

    return result;
  }, [users, payers]);

  const [initialValues, setInitialValues] = useState<DebtFormValues>({
    name: '',
    description: '',
    center: debtCenterId,
    payer: null,
    date: null,
    dueDate: undefined,
    components: [],
    paymentCondition: {
      type: 'interval',
      value: 14,
    },
    amount: euro(0),
    accountingPeriod: activeAccountingPeriod,
  });

  useEffect(() => {
    if (
      initialValues.accountingPeriod === null &&
      activeAccountingPeriod !== null
    ) {
      setInitialValues(prev => ({
        ...prev,
        accountingPeriod: activeAccountingPeriod,
      }));
    }
  }, [activeAccountingPeriod, initialValues.accountingPeriod]);

  return (
    <div>
      <h1 className="text-2xl mt-10 mb-5">
        <Breadcrumbs
          segments={[
            {
              text: 'Debts',
              url: '/admin/debts',
            },
            'Create Debt',
          ]}
        />
      </h1>
      <Formik
        initialValues={initialValues}
        enableReinitialize
        validate={values => {
          const errors: Partial<Record<keyof DebtFormValues, string>> = {};

          if (!values.name) {
            errors.name = 'Required field';
          }

          if (!values.center) {
            errors.center = 'Required field';
          }

          if (!values.payer) {
            errors.payer = 'Required field';
          }

          if (values.paymentCondition === null) {
            errors.paymentCondition = errors.dueDate =
              'Either payment condition or due date must be specififed';
          }

          if (values.components.length === 0) {
            errors.components = 'Must specify at least one component';
          }

          return errors;
        }}
        onSubmit={submitDebtForm}
      >
        {({
          values,
          submitForm,
          isSubmitting,
          setFieldError,
          setFieldValue,
        }) => {
          if (
            values.center !== debtCenterId &&
            typeof values.center === 'string'
          ) {
            setDebtCenterId(values.center);
          }

          return (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-x-8">
              <InputGroup label="Name" name="name" component={TextField} />
              <InputGroup
                label="Center"
                name="center"
                allowCustom
                component={DropdownField}
                options={(debtCenters ?? []).map(center => ({
                  text: center.name,
                  value: center.id,
                }))}
                createCustomOption={(name: string) => ({ name })}
                formatCustomOption={
                  (({ name }: { name: string }) => name) as any
                }
              />
              <InputGroup
                label="Payer"
                name="payer"
                allowCustom
                component={DropdownField}
                createCustomOption={createCustomPayerOption}
                formatCustomOption={formatCustomPayerOption as any}
                options={payerOptions}
              />
              <InputGroup
                narrow
                label="Due Date"
                name="dueDate"
                component={DateField}
                format="yyyy-MM-dd"
                value={
                  values.paymentCondition?.type === 'date'
                    ? values.paymentCondition.value
                    : ''
                }
                onChange={evt => {
                  const result = dbDateString.decode(evt.target.value);

                  if (isRight(result)) {
                    setFieldValue('paymentCondition', {
                      type: 'date',
                      value: result.right,
                    });
                  } else {
                    setFieldValue('paymentCondition', null);
                    setFieldError(
                      'dueDate',
                      'Date in the format yyyy-mm-dd expected.',
                    );
                  }
                }}
              />
              <InputGroup
                narrow
                label="Payment Condition"
                name="paymentCondition"
                component={TextField}
                value={
                  values.paymentCondition?.type === 'interval'
                    ? values.paymentCondition.value === 0
                      ? 'NOW'
                      : values.paymentCondition.value
                    : ''
                }
                onChange={evt => {
                  const value = evt.target.value;

                  if (value === 'NOW') {
                    setFieldValue('paymentCondition', {
                      type: 'interval',
                      value: 0,
                    });

                    return;
                  }

                  try {
                    const matches = /[0-9]+/.exec(value);
                    const integer = parseInt(matches?.[0] ?? '');

                    if (isNaN(integer)) {
                      setFieldValue('paymentCondition', null);
                      setFieldError('paymentCondition', 'Integer expected');
                    } else {
                      setFieldValue('paymentCondition', {
                        type: 'interval',
                        value: integer,
                      });
                    }
                  } catch (e) {
                    setFieldValue('paymentCondition', null);
                    setFieldError('paymentCondition', 'Integer expected');
                  }
                }}
              />
              <InputGroup
                narrow
                label="Date"
                name="date"
                format="yyyy-MM-dd"
                component={DateField}
              />
              {(accountingPeriods?.length ?? 0) > 1 && (
                <InputGroup
                  narrow
                  label="Accounting Period"
                  name="accountingPeriod"
                  component={DropdownField}
                  options={(accountingPeriods ?? [])
                    .filter(period => !period.closed)
                    .map(period => ({
                      value: period.year,
                      text: `${period.year}`,
                    }))}
                />
              )}
              <InputGroup
                label="Description"
                name="description"
                component={Textarea}
                fullWidth
              />
              <InputGroup
                label="Components"
                name="components"
                fullWidth
                component={TabularFieldListFormik}
                createNew={() => ({
                  key: uid(),
                  component: '',
                  amount: 0,
                })}
                columns={[
                  {
                    header: 'Component',
                    component: DropdownField,
                    key: 'component' as any,
                    props: {
                      options: (centerComponents ?? []).map(component => ({
                        value: component.id,
                        text: component.name,
                      })),
                      allowCustom: true,
                      formatCustomOption: ({ name }: { name: string }) => name,
                      createCustomOption: (name: string) => ({ name }),
                    },
                  },
                  {
                    header: 'Amount',
                    component: EuroField,
                    key: 'amount' as any,
                    props: (row: DebtFormComponentValue) => {
                      const component = (centerComponents ?? []).find(
                        c => c.id === row.component,
                      );

                      return {
                        readOnly: typeof row.component === 'string',
                        value: component
                          ? component.amount.value / 100
                          : row.amount,
                      };
                    },
                  },
                ]}
              />
              <div className="col-span-full flex items-center justify-end gap-3 mt-2">
                <button className="bg-gray-100 hover:bg-gray-200 active:ring-2 shadow-sm rounded-md py-1.5 px-3 text-gray-500 font-bold">
                  Cancel
                </button>
                <button
                  className="bg-blue-500 disabled:bg-gray-400 hover:bg-blue-600 active:ring-2 shadow-sm rounded-md py-1.5 px-3 text-white font-bold"
                  onClick={submitForm}
                  disabled={isSubmitting}
                >
                  Create
                </button>
              </div>
            </div>
          );
        }}
      </Formik>
    </div>
  );
};
