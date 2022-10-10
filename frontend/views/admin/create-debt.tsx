import { Formik } from 'formik'
import { useLocation } from 'wouter'
import { useMemo, useCallback } from 'react'

import { Breadcrumbs } from '../../components/breadcrumbs'
import { DateField } from '../../components/datetime-field'
import { DropdownField } from '../../components/dropdown-field'
import { EuroField } from '../../components/euro-field'
import { euro, PayerIdentity } from '../../../common/types'
import { InputGroup } from '../../components/input-group'
import * as R from 'remeda'
import { TabularFieldListFormik } from '../../components/tabular-field-list'
import { TextareaField } from '../../components/textarea-field'
import { TextField } from '../../components/text-field'
import { useCreateDebtCenterMutation, useGetDebtCentersQuery } from '../../api/debt-centers'
import { useCreateDebtMutation, useGetDebtComponentsQuery, useCreateDebtComponentMutation, useGetDebtComponentsByCenterQuery } from '../../api/debt'
import { useGetUpstreamUsersQuery } from '../../api/upstream-users'
import { format, addDays, isMatch } from 'date-fns'

const useQuery = () => {
  const [location] = useLocation()

  const query = useMemo(() => {
    const search = location.split('?', 1)[1];

    if (!search) {
      return {};
    }

    return Object.fromEntries(new URLSearchParams(search));
  }, [location]);

  return query;
};

type DebtFormValues = {
  name: string,
  center: string | { name: string },
  description: string,
  due_date: string,
  components: { component: string | { name: string }, amount: number }[],
  amount: number,
  payer: PayerIdentity | null
}

export const CreateDebt = ({ debtCenterId }) => {
  const { data: users } = useGetUpstreamUsersQuery(null)
  const { data: debtCenters, isLoading } = useGetDebtCentersQuery(null)
  const { data: centerComponents } = useGetDebtComponentsByCenterQuery(debtCenterId, { skip: !debtCenterId })
  const [createDebt] = useCreateDebtMutation()
  const [createDebtCenter] = useCreateDebtCenterMutation()
  const [createDebtComponent] = useCreateDebtComponentMutation()
  const debtComponentsQuery = useGetDebtComponentsQuery(null)

  const submitDebtForm = async (values: DebtFormValues) => {
    await createDebt({
      ...values,
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
        }
      })
    } as any)
  }

  const createCustomPayerOption = useCallback(
    (input) => ({
      type: 'email',
      value: input,
    }),
    []
  )

  const formatCustomPayerOption = useCallback(
    ({ value }) => value,
    []
  )

  const payerOptions = useMemo(() => {
    if (!users) return [];

    return users.map(user => ({
      value: { type: 'tkoaly', value: user.id },
      text: user.screenName,
      label: user.username,
    }));
  }, [users])

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
        initialValues={{
          name: '',
          description: '',
          center: debtCenterId,
          payer: null,
          components: [],
          due_date: format(addDays(new Date(), 31), 'dd.MM.yyyy'),
          amount: 1234.31,
        } as DebtFormValues}
        validate={(values) => {
          const errors = {} as any;

          if (!/^[0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4}$/.test(values.due_date)) {
            errors.due_date = 'Date must be in format <day>.<month>.<year>'
          } else if (!isMatch(values.due_date, 'dd.MM.yyyy')) {
            errors.due_date = 'Invalid date'
          }

          return errors;
        }}
        onSubmit={submitDebtForm}
      >
        {({ values, submitForm, isSubmitting }) => (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
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
              createCustomOption={(name) => ({ name })}
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
            <InputGroup label="Due Date" name="due_date" component={DateField} />
            <InputGroup label="Description" name="description" component={TextareaField} fullWidth />
            <InputGroup
              label="Components"
              name="components"
              fullWidth
              component={TabularFieldListFormik}
              createNew={() => ({
                component: '',
                amount: 123.12,
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
                    const component = (centerComponents ?? []).find(c => c.id === row.component)

                    return {
                      readOnly: typeof row.component === 'string',
                      value: component ? component.amount.value / 100 : 0,
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
        )}
      </Formik>
    </div>
  );
};
