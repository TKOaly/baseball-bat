import { Formik } from 'formik';
import { useMemo, useCallback, useState, useEffect } from 'react';
import { Breadcrumbs } from '../../components/breadcrumbs';
import { DropdownField } from '../../components/dropdown-field';
import { EuroField } from '../../components/euro-field';
import { DateField } from '../../components/datetime-field';
import { DbDateString, dbDateString, euro, EuroValue, PayerIdentity } from '../../../common/types';
import { InputGroup } from '../../components/input-group';
import { TabularFieldListFormik } from '../../components/tabular-field-list';
import { TextareaField } from '../../components/textarea-field';
import { TextField } from '../../components/text-field';
import { useGetDebtCentersQuery } from '../../api/debt-centers';
import { useCreateDebtMutation, useGetDebtComponentsByCenterQuery } from '../../api/debt';
import { useGetUpstreamUsersQuery } from '../../api/upstream-users';
import { useLocation } from 'wouter';
import { isRight } from 'fp-ts/lib/Either';
import { useAppSelector } from '../../store';
import { useGetAccountingPeriodsQuery } from '../../api/accounting';

type DebtFormValues = {
  name: string,
  center: string | { name: string },
  description: string,
  components: { component: string | { name: string }, amount: EuroValue }[],
  amount: EuroValue,
  payer: PayerIdentity | null
  date: DbDateString | null
  dueDate: DbDateString | null
  paymentCondition: string | 'NOW' | null
  accountingPeriod: number
}

export const CreateDebt = (props: { debtCenterId?: string }) => {
  const { data: users } = useGetUpstreamUsersQuery();
  const { data: debtCenters } = useGetDebtCentersQuery();
  const [debtCenterId, setDebtCenterId] = useState(props.debtCenterId)
  const { data: centerComponents } = useGetDebtComponentsByCenterQuery(debtCenterId, { skip: !debtCenterId });
  const [createDebt] = useCreateDebtMutation();
  const [, setLocation] = useLocation();
  const activeAccountingPeriod = useAppSelector((state) => state.accountingPeriod.activePeriod);
  const { data: accountingPeriods } = useGetAccountingPeriodsQuery();

  const submitDebtForm = async (values: DebtFormValues) => {
    const result = await createDebt({
      name: values.name,
      description: values.description,
      accountingPeriod: values.accountingPeriod,
      tags: [],
      payer: values.payer,
      date: values.date ?? undefined,
      dueDate: (values.dueDate === '' || !values.dueDate) ? undefined : values.dueDate,
      paymentCondition: values.paymentCondition === 'NOW' ? 0 : parseInt(values.paymentCondition),
      center: typeof values.center === 'string'
        ? values.center
        : { ...values.center, url: '', description: '' },
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

  const createCustomPayerOption = useCallback(
    (input) => ({
      type: 'email',
      value: input,
    }),
    [],
  );

  const formatCustomPayerOption = useCallback(
    ({ value }) => value,
    [],
  );

  const payerOptions = useMemo(() => {
    if (!users) return [];

    return users.map(user => ({
      value: { type: 'tkoaly', value: user.id },
      text: user.screenName,
      label: user.username,
    }));
  }, [users]);

  const [initialValues, setInitialValues] = useState<DebtFormValues>({
    name: '',
    description: '',
    center: debtCenterId,
    payer: null,
    date: null,
    dueDate: null,
    components: [],
    paymentCondition: '14',
    amount: euro(0),
    accountingPeriod: activeAccountingPeriod,
  });

  useEffect(() => {
    if (initialValues.accountingPeriod === null && activeAccountingPeriod !== null) {
      setInitialValues((prev) => ({
        ...prev,
        accountingPeriod: activeAccountingPeriod,
      }))
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
        validate={(values) => {
          const errors: Partial<Record<keyof DebtFormValues, string>> = {};

          try {
            if (values.paymentCondition !== 'NOW') {
              parseInt(values.paymentCondition);
            }
          } catch (e) {
            errors.paymentCondition = 'Must be an integer';
          }

          return errors;
        }}
        onSubmit={submitDebtForm}
      >
        {({ values, submitForm, isSubmitting, setFieldError, setFieldValue }) => {
          if (values.center !== debtCenterId && typeof values.center === 'string') {
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
                options={(debtCenters ?? []).map((center) => ({
                  text: center.name,
                  value: center.id,
                }))}
                createCustomOption={(name: string) => ({ name })}
                formatCustomOption={({ name }) => name}
              />
              <InputGroup
                label="Payer"
                name="payer"
                allowCustom
                component={DropdownField}
                createCustomOption={createCustomPayerOption}
                formatCustomOption={formatCustomPayerOption}
                options={payerOptions}
              />
              <InputGroup
                narrow
                label="Due Date"
                name="dueDate"
                component={DateField}
                format="yyyy-MM-dd"
                onChange={(evt) => {
                  const result = dbDateString.decode(evt.target.value);

                  if (isRight(result)) {
                    setFieldValue('dueDate', result.right);
                    setFieldValue('paymentCondition', '');
                  } else {
                    setFieldError('dueDate', 'Invalid date value.');
                  }
                }}
              />
              <InputGroup
                narrow
                label="Payment Condition"
                name="paymentCondition"
                component={TextField}
                onChange={(evt) => {
                  const value = evt.target.value;

                  setFieldValue('dueDate', '');

                  if (value === 'NOW') {
                    setFieldValue('paymentCondition', 'NOW');
                    return;
                  }

                  try {
                    const matches = /[0-9]+/.exec(value);
                    const integer = parseInt(matches[0]);
                    setFieldValue('paymentCondition', integer === 0 ? 'NOW' : String(integer));
                  } catch (e) {
                    setFieldValue('paymentCondition', value);
                    setFieldError('paymentCondition', 'Integer expected');
                  }
                }}
              />
              <InputGroup
                narrow
                label="Date"
                name="date"
                component={DateField}
              />
              { accountingPeriods?.length > 1 && (
                <InputGroup
                  narrow
                  label="Accounting Period"
                  name="accountingPeriod"
                  component={DropdownField}
                  options={
                    (accountingPeriods ?? [])
                      .filter((period) => !period.closed)
                      .map((period) => ({
                        value: period.year,
                        text: period.year,
                      }))
                  }
                />
              )}
              <InputGroup label="Description" name="description" component={TextareaField} fullWidth />
              <InputGroup
                label="Components"
                name="components"
                fullWidth
                component={TabularFieldListFormik}
                createNew={() => ({
                  component: '',
                  amount: 0,
                })}
                columns={[
                  {
                    header: 'Component',
                    component: DropdownField,
                    key: 'component',
                    props: {
                      options: (centerComponents ?? []).map((component) => ({
                        value: component.id,
                        text: component.name,
                      })),
                      allowCustom: true,
                      formatCustomOption: ({ name }) => name,
                      createCustomOption: (name) => ({ name }),
                    },
                  },
                  {
                    header: 'Amount',
                    component: EuroField,
                    key: 'amount',
                    props: (row) => {
                      const component = (centerComponents ?? []).find(c => c.id === row.component);

                      return {
                        readOnly: typeof row.component === 'string',
                        value: component ? component.amount.value / 100 : row.amount,
                      };
                    },
                  },
                ]}
              />
              <div className="col-span-full flex items-center justify-end gap-3 mt-2">
                <button className="bg-gray-100 hover:bg-gray-200 active:ring-2 shadow-sm rounded-md py-1.5 px-3 text-gray-500 font-bold">Cancel</button>
                <button className="bg-blue-500 disabled:bg-gray-400 hover:bg-blue-600 active:ring-2 shadow-sm rounded-md py-1.5 px-3 text-white font-bold" onClick={submitForm} disabled={isSubmitting}>Create</button>
              </div>
            </div>
          );
        }}
      </Formik>
    </div>
  );
};
