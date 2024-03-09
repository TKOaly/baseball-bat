import { Formik } from 'formik';
import { Breadcrumbs } from '@bbat/ui/breadcrumbs';
import { useCreateDebtCenterMutation } from '../../api/debt-centers';
import { Link, useLocation } from 'wouter';
import { InputGroup } from '../../components/input-group';
import { TextField } from '@bbat/ui/text-field';
import { Textarea } from '@bbat/ui/textarea';
import { TabularFieldListFormik } from '../../components/tabular-field-list';
import { EuroField } from '../../components/euro-field';
import { useCreateDebtComponentMutation } from '../../api/debt';
import { euro } from '@bbat/common/src/currency';
import { useDialog } from '../../components/dialog';
import { InfoDialog } from '../../components/dialogs/info-dialog';
import { useGetAccountingPeriodsQuery } from '../../api/accounting';
import { useAppSelector } from '../../store';
import { useEffect, useState } from 'react';
import { DropdownField } from '@bbat/ui/dropdown-field';

type FormValues = {
  name: string;
  url: string;
  description: string;
  components: { name: string; amount: number; description: string }[];
  accountingPeriod: null | number;
};

export const CreateDebtCenter = () => {
  const [createDebtCenter] = useCreateDebtCenterMutation();
  const [createDebtComponent] = useCreateDebtComponentMutation();
  const activeAccountingPeriod = useAppSelector(
    state => state.accountingPeriod.activePeriod,
  );
  const { data: accountingPeriods } = useGetAccountingPeriodsQuery();
  const [, setLocation] = useLocation();
  const showInfoDialog = useDialog(InfoDialog);

  const [initialValues, setInitialValues] = useState<FormValues>({
    name: '',
    url: '',
    description: '',
    components: [],
    accountingPeriod: null,
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
      <h1 className="mb-5 mt-10 text-2xl">
        <Breadcrumbs
          linkComponent={Link}
          segments={[{ text: 'Debt Center', url: '/admin' }, 'Create']}
        />
      </h1>
      <p className="text-md mb-7 text-gray-800"></p>
      <Formik
        initialValues={initialValues}
        enableReinitialize
        validate={values => {
          const errors: Record<string, string> = {};

          if (values.name.length < 3) {
            errors.name = 'Name must be longer than 3 characters.';
          }

          const componentNames = new Set();

          values.components.forEach((component, i) => {
            if (componentNames.has(component.name)) {
              errors[`components.${i}.name`] = 'Duplicate component name.';
            }

            componentNames.add(component.name);
          });

          return errors;
        }}
        onSubmit={async (values, { setFieldError }) => {
          const accountingPeriod =
            values.accountingPeriod ?? activeAccountingPeriod;

          if (!accountingPeriod) {
            return;
          }

          const res = await createDebtCenter({
            ...values,
            accountingPeriod,
          });

          if ('error' in res) {
            const error = res.error as any;
            setFieldError(error.data.field, error.data.message);
            return;
          }

          const createComponents = values.components.map(
            async (component, i) => {
              const componentRes = await createDebtComponent({
                ...component,
                amount: euro(component.amount),
                debtCenterId: res.data.id,
              });

              if ('data' in componentRes) {
                return componentRes.data.id;
              } else {
                setFieldError(
                  `components.${i}.name`,
                  'Failed to create component.',
                );
                throw new Error();
              }
            },
          );

          try {
            await Promise.all(createComponents);
            setLocation(`/admin/debt-centers/${res.data.id}`);
          } catch (e) {
            showInfoDialog({
              title: 'Failed to create debt center',
              content: (
                <>
                  <p>
                    Failed to create debt center due to the following error:
                  </p>
                  <pre>{`${e}`}</pre>
                </>
              ),
            });
          }
        }}
      >
        {({ submitForm, isSubmitting }) => (
          <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
            <div className="col-span-full mb-4 border-b px-1 pb-2 text-xs font-bold uppercase text-gray-400">
              Basic Information
            </div>
            <p className="col-span-full mb-2 text-sm">
              Lorem ipsum dolor sit amet.
            </p>
            <InputGroup narrow label="Name" name="name" component={TextField} />
            <InputGroup narrow label="URL" name="url" component={TextField} />
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
                    text: period.year.toString(),
                  }))}
              />
            )}
            <InputGroup
              label="Description"
              name="description"
              fullWidth
              component={Textarea}
            />
            <InputGroup
              label="Components"
              name="components"
              fullWidth
              component={TabularFieldListFormik}
              columns={[
                {
                  key: 'name' as any,
                  header: 'Name',
                  component: TextField,
                },
                {
                  key: 'amount' as any,
                  header: 'Amount',
                  component: EuroField,
                },
                {
                  key: 'description' as any,
                  component: TextField,
                  header: 'Description',
                },
              ]}
              createNew={() => ({
                key: 'new',
                name: '',
                amount: 0,
                description: '',
              })}
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
                Create
              </button>
            </div>
          </div>
        )}
      </Formik>
    </div>
  );
};
