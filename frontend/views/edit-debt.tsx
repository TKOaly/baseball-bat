import { Formik } from 'formik';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NewDebtComponent, PayerIdentity } from '../../common/types';
import * as dfns from 'date-fns';
import {
  useCreateDebtComponentMutation,
  useGetDebtComponentsByCenterQuery,
  useGetDebtQuery,
  useUpdateDebtMutation,
} from '../api/debt';
import { Breadcrumbs } from '../components/breadcrumbs';
import { InputGroup } from '../components/input-group';
import { TextField } from '../components/text-field';
import { DropdownField } from '../components/dropdown-field';
import { TabularFieldListFormik } from '../components/tabular-field-list';
import { EuroField } from '../components/euro-field';
import {
  useCreateDebtCenterMutation,
  useGetDebtCentersQuery,
} from '../api/debt-centers';
import { useGetUpstreamUsersQuery } from '../api/upstream-users';
import { DateField } from '../components/datetime-field';
import { TextareaField } from '../components/textarea-field';
import { PublishedDebtEditConfirmation } from '../components/dialogs/published-debt-edit-confirmation';
import * as E from 'fp-ts/lib/Either';
import * as TE from 'fp-ts/lib/TaskEither';
import * as A from 'fp-ts/lib/Array';
import { useDialog } from '../components/dialog';
import { useLocation } from 'wouter';
import { useGetPayersQuery } from '../api/payers';
import { DebtAssociatedResourceCreationConfirmationDialog } from '../components/dialogs/debt-associated-resource-creation-confirmation-dialog';
import { pipe } from 'fp-ts/lib/function';
import { euro } from '../../common/currency';

type DebtFormValues = {
  name: string;
  center: string | { name: string };
  description: string;
  date: string | null;
  due_date: string | null;
  payment_condition: number | string | null;
  components: { component: string | { name: string }; amount: number }[];
  payer: PayerIdentity | null;
};

export const EditDebt = ({ params }: { params: { id: string } }) => {
  const { id } = params;
  const { data: users } = useGetUpstreamUsersQuery();
  const { data: payers } = useGetPayersQuery();
  const { data: debt } = useGetDebtQuery(id);
  const { data: debtCenters } = useGetDebtCentersQuery();
  const [debtCenterId, setDebtCenterId] = useState(debt?.debtCenterId);
  const { data: centerComponents } = useGetDebtComponentsByCenterQuery(
    debtCenterId,
    { skip: !debtCenterId },
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

    const existingComponents = debt.debtComponents.map(dc => dc.id);

    const confirmedRef = { value: false };
    const newComponentsRef = { value: [] };
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
            const found = debt.debtComponents.find(c => c.id === component);

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

    let centerId = typeof values.center === 'string' ? values.center : null;

    if (centerId === null) {
      if (!(await confirm())) {
        return;
      }

      const result = await createDebtCenter({
        name: typeof values.center === 'string' ? '' : values.center.name,
        description: '',
        url: '',
      });

      if ('data' in result) {
        centerId = result.data.id;
        existingComponentsRef.value = [];
      } else {
        return;
      }
    }

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

    const result = await updateDebt({
      id,
      name: values.name,
      description: values.description,
      dueDate: values.due_date
        ? dfns.parse(values.due_date, 'dd.MM.yyyy', new Date())
        : null,
      date:
        values.date === null
          ? undefined
          : values.date === ''
          ? null
          : values.date,
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
          ? dfns.format(new Date(debt.dueDate), 'dd.MM.yyyy')
          : null,
        date: debt.date ? dfns.format(new Date(debt.date), 'dd.MM.yyyy') : null,
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
        due_date: dfns.format(new Date(), 'dd.MM.yyyy'),
        date: null,
        payment_condition: null,
        payer: null,
        components: [],
      };
    }
  }, [debt]);

  const createCustomPayerOption = useCallback(
    input => ({
      type: 'email',
      value: input,
    }),
    [],
  );

  const formatCustomPayerOption = useCallback(({ value }) => value, []);

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

  return (
    <div>
      <h1 className="text-2xl mt-10 mb-5">
        <Breadcrumbs
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
            } else if (!dfns.isMatch(values.due_date, 'dd.MM.yyyy')) {
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
                createCustomOption={name => ({ name })}
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
                    const integer = parseInt(matches[0]);
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
                component={TextareaField}
                fullWidth
              />
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
                      options: (centerComponents ?? []).map(component => ({
                        value: component.id,
                        text: component.name,
                      })),
                      allowCustom: true,
                      formatCustomOption: ({ name }) => name,
                      createCustomOption: name => ({ name }),
                    },
                  },
                  {
                    header: 'Amount',
                    component: EuroField,
                    key: 'amount',
                    props: row => {
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
