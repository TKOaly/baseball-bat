import { Formik } from 'formik';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  dbDateString,
  euro,
  EuroValue,
  NewDebtComponent,
  PayerIdentity,
} from '@bbat/common/src/types';
import { parse } from 'date-fns/parse';
import { format } from 'date-fns/format';
import { isMatch } from 'date-fns/isMatch';
import {
  useCreateDebtComponentMutation,
  useGetDebtComponentsByCenterQuery,
  useGetDebtQuery,
  useUpdateDebtMutation,
} from '../../api/debt';
import { Breadcrumbs } from '@bbat/ui/breadcrumbs';
import { InputGroup } from '../../components/input-group';
import { TextField } from '@bbat/ui/text-field';
import { DropdownField } from '@bbat/ui/dropdown-field';
import { TabularFieldListFormik } from '../../components/tabular-field-list';
import { EuroField } from '../../components/euro-field';
import {
  useCreateDebtCenterMutation,
  useGetDebtCentersQuery,
} from '../../api/debt-centers';
import { useGetUpstreamUsersQuery } from '../../api/upstream-users';
import { DateField } from '@bbat/ui/datetime-field';
import { Textarea } from '@bbat/ui/textarea';
import { PublishedDebtEditConfirmation } from '../../components/dialogs/published-debt-edit-confirmation';
import * as E from 'fp-ts/Either';
import * as TE from 'fp-ts/TaskEither';
import * as A from 'fp-ts/Array';
import { useDialog } from '../../components/dialog';
import { Link, RouteComponentProps, useLocation } from 'wouter';
import { useGetPayersQuery } from '../../api/payers';
import { DebtAssociatedResourceCreationConfirmationDialog } from '../../components/dialogs/debt-associated-resource-creation-confirmation-dialog';
import { pipe } from 'fp-ts/function';
import { skipToken } from '@reduxjs/toolkit/query';
import { useAppSelector } from '../../store';
import { uid } from 'uid';

type DebtFormComponentValue = {
  component: string | { name: string };
  amount: number;
};

type DebtFormValues = {
  name: string;
  center: string | { name: string };
  description: string;
  date: string | null;
  due_date: string | null;
  payment_condition: number | string | null;
  components: DebtFormComponentValue[];
  payer: PayerIdentity | null;
};

type Props = RouteComponentProps<{ id: string }>;

export const EditDebt = ({ params }: Props) => {
  const { id } = params;
  const { data: users } = useGetUpstreamUsersQuery();
  const { data: payersResult } = useGetPayersQuery({});
  const payers = payersResult?.result;
  const { data: debt } = useGetDebtQuery(id);
  const { data: debtCenters } = useGetDebtCentersQuery();
  const [debtCenterId, setDebtCenterId] = useState(debt?.debtCenterId);
  const { data: centerComponents } = useGetDebtComponentsByCenterQuery(
    debtCenterId ?? skipToken,
  );
  const [updateDebt] = useUpdateDebtMutation();
  const [createDebtCenter] = useCreateDebtCenterMutation();
  const [createDebtComponent] = useCreateDebtComponentMutation();
  const [, setLocation] = useLocation();
  const [editPublished, setEditPublished] = useState(false);
  const showPublishedDebtEditConfirmationDialog = useDialog(
    PublishedDebtEditConfirmation,
  );
  const showResourceCreationDialog = useDialog(
    DebtAssociatedResourceCreationConfirmationDialog,
  );

  const activeAccountingPeriod = useAppSelector(
    state => state.accountingPeriod.activePeriod,
  );

  useEffect(() => {
    if (debt && !debt.draft && !editPublished) {
      showPublishedDebtEditConfirmationDialog({}).then(allow => {
        if (allow) {
          setEditPublished(true);
        } else {
          setLocation(`/admin/debts/${id}`);
        }
      });
    }
  }, [debt]);

  const handleSubmit = async (values: DebtFormValues) => {
    if (!values.payer) {
      return;
    }

    const existingComponents = debt?.debtComponents?.map(dc => dc.id) ?? [];

    const confirmedRef = { value: false };
    const newComponentsRef = {
      value: [] as { name: string; amount: EuroValue }[],
    };
    const existingComponentsRef = { value: existingComponents };

    const separateComponents = () => {
      const { left, right } = pipe(
        values.components,
        A.map(({ component, amount }) => {
          if (typeof component !== 'string') {
            return E.left({
              name: component.name,
              amount: euro(amount),
            });
          } else if (existingComponentsRef.value.indexOf(component) === -1) {
            const found = debt?.debtComponents?.find(c => c.id === component);

            if (found) {
              const { name, amount } = found;

              return E.left({
                name,
                amount,
              });
            } else {
              return E.right(component);
            }
          } else {
            return E.right(component);
          }
        }),
        A.separate,
      );

      newComponentsRef.value = left;

      return { left, right };
    };

    separateComponents();

    const confirm = async () => {
      if (confirmedRef.value) {
        return true;
      }

      const confirmed = await showResourceCreationDialog({
        debtCenter:
          typeof values.center !== 'string' ? values.center.name : null,
        components: pipe(
          newComponentsRef.value,
          A.map(c => c.name),
        ),
      });

      if (confirmed) {
        confirmedRef.value = true;
      }

      return confirmed;
    };

    const handleDebtCenterCreation = async () => {
      if (!(await confirm())) {
        return;
      }

      if (!activeAccountingPeriod) {
        return;
      }

      const result = await createDebtCenter({
        name: typeof values.center === 'string' ? '' : values.center.name,
        description: '',
        url: '',
        accountingPeriod: activeAccountingPeriod,
      });

      if ('data' in result) {
        existingComponentsRef.value = [];
        return result.data.id;
      } else {
        throw new Error('Failed to create debt center!');
      }
    };

    const centerId =
      typeof values.center === 'string'
        ? values.center
        : await handleDebtCenterCreation();

    const { left: newComponents, right: components } = separateComponents();

    if (newComponents.length > 0) {
      if (!(await confirm())) {
        return;
      }

      const createDebtComponentTask = (param: NewDebtComponent) => async () => {
        const result = await createDebtComponent(param);

        if ('data' in result) {
          return E.right(result.data);
        } else {
          return E.left(result.error);
        }
      };

      const result = await pipe(
        newComponents,
        A.map(({ name, amount }) => ({
          name,
          amount,
          description: '',
          debtCenterId: centerId,
        })),
        A.traverse(TE.ApplicativePar)(createDebtComponentTask),
        TE.map(A.map(result => result.id)),
      )();

      if (E.isRight(result)) {
        components.push(...result.right);
      } else {
        return;
      }
    }

    let date = undefined;

    if (values.date !== null && values.date !== '') {
      const result = dbDateString.decode(values.date);

      if (E.isRight(result)) {
        date = result.right;
      } else {
        return;
      }
    }

    const result = await updateDebt({
      id,
      name: values.name,
      description: values.description,
      dueDate: values.due_date
        ? parse(values.due_date, 'dd.MM.yyyy', new Date())
        : null,
      date,
      paymentCondition: values.payment_condition
        ? parseInt('' + values.payment_condition)
        : null,
      payerId: values.payer,
      centerId,
      components, // : components.map((component) => typeof component === 'string' ? { id: component } : component),
    });

    if ('data' in result) {
      setLocation(`/admin/debts/${result.data.id}`);
    }
  };

  const initialValues = useMemo((): DebtFormValues => {
    if (debt) {
      return {
        name: debt.name,
        center: debt.debtCenterId,
        description: debt.description,
        due_date: debt.dueDate
          ? format(new Date(debt.dueDate), 'dd.MM.yyyy')
          : null,
        date: debt.date ? format(new Date(debt.date), 'dd.MM.yyyy') : null,
        payment_condition: debt.paymentCondition,
        payer: debt.payerId,
        components: debt.debtComponents.map(({ id, amount }) => ({
          component: id,
          amount: amount.value / 100,
        })),
      };
    } else {
      return {
        name: '',
        center: { name: '' },
        description: '',
        due_date: format(new Date(), 'dd.MM.yyyy'),
        date: null,
        payment_condition: null,
        payer: null,
        components: [],
      };
    }
  }, [debt]);

  const createCustomPayerOption = useCallback(
    (input: string) => ({
      type: 'email',
      value: input,
    }),
    [],
  );

  const formatCustomPayerOption = useCallback(
    ({ value }: { value: string }) => value,
    [],
  );

  const payerOptions = useMemo(() => {
    const options = [];

    if (users) {
      options.push(
        ...users.map(user => ({
          value: { type: 'tkoaly', value: user.id },
          text: user.screenName,
          label: user.username,
        })),
      );
    }

    if (payers) {
      options.push(
        ...payers.map(payer => ({
          value: payer.id,
          text: payer.name,
        })),
      );
    }

    return options;
  }, [users, payers]);

  if (!debt) {
    return;
  }

  return (
    <div>
      <h1 className="mb-5 mt-10 text-2xl">
        <Breadcrumbs
          linkComponent={Link}
          segments={[
            {
              text: 'Debts',
              url: '/admin/debts',
            },
            {
              text: debt?.name ?? id,
              url: `/admin/debts/${id}`,
            },
            'Create Debt',
            'Edit',
          ]}
        />
      </h1>
      <Formik
        enableReinitialize
        initialValues={initialValues}
        validate={values => {
          const errors: Partial<Record<keyof DebtFormValues, string>> = {};

          if (values.due_date) {
            if (!/^[0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4}$/.test(values.due_date)) {
              errors.due_date = 'Date must be in format <day>.<month>.<year>';
            } else if (!isMatch(values.due_date, 'dd.MM.yyyy')) {
              errors.due_date = 'Invalid date';
            }
          }

          return errors;
        }}
        onSubmit={handleSubmit}
      >
        {({
          values,
          submitForm,
          isSubmitting,
          setFieldValue,
          setFieldError,
        }) => {
          if (
            typeof values.center === 'string' &&
            values.center !== debtCenterId
          ) {
            setDebtCenterId(values.center);
          }

          return (
            <div className="grid grid-cols-2 gap-x-8 xl:grid-cols-4">
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
                name="due_date"
                component={DateField}
                onChange={evt => {
                  console.log(evt);
                  setFieldValue('due_date', evt.target.value);
                  setFieldValue('payment_condition', '');
                }}
              />
              <InputGroup
                narrow
                label="Payment Condition"
                name="payment_condition"
                readOnly={debt && !debt.draft}
                component={TextField}
                onChange={evt => {
                  const value = evt.target.value;

                  setFieldValue('due_date', '');

                  if (value === 'NOW') {
                    setFieldValue('payment_condition', 'NOW');
                    return;
                  }

                  try {
                    const matches = /[0-9]+/.exec(value);
                    const integer = parseInt(matches?.[0] ?? '');
                    setFieldValue(
                      'payment_condition',
                      integer === 0 ? 'NOW' : String(integer),
                    );
                  } catch (e) {
                    setFieldValue('payment_condition', value);
                    setFieldError('payment_condition', 'Integer expected');
                  }
                }}
              />
              <InputGroup
                narrow
                label="Date"
                name="date"
                component={DateField}
              />
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
              <div className="col-span-full mt-2 flex items-center justify-end gap-3">
                <button className="rounded-md bg-gray-100 px-3 py-1.5 font-bold text-gray-500 shadow-sm hover:bg-gray-200 active:ring-2">
                  Cancel
                </button>
                <button
                  className="rounded-md bg-blue-500 px-3 py-1.5 font-bold text-white shadow-sm hover:bg-blue-600 active:ring-2 disabled:bg-gray-400"
                  onClick={submitForm}
                  disabled={isSubmitting}
                >
                  Save
                </button>
              </div>
            </div>
          );
        }}
      </Formik>
    </div>
  );
};
