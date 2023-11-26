import { Formik } from 'formik';
import { useMemo } from 'react';
import { Link, RouteComponentProps, useLocation } from 'wouter';
import { PayerEmailPriority } from '@bbat/common/src/types';
import { useGetPayerQuery, useUpdatePayerMutation } from '../../api/payers';
import { Breadcrumbs } from '@bbat/ui/breadcrumbs';
import { DropdownField } from '@bbat/ui/dropdown-field';
import { InputGroup } from '../../components/input-group';
import { TabularFieldListFormik } from '../../components/tabular-field-list';
import { TextField } from '@bbat/ui/text-field';
import { uid } from 'uid';

type Props = RouteComponentProps<{ id: string }>;

type FormEmail = {
  priority: PayerEmailPriority;
  email: string;
};

type FormValues = {
  name: string;
  emails: FormEmail[];
  disabled: boolean;
};

export const EditPayer = ({ params }: Props) => {
  const [, setLocation] = useLocation();
  const { data: payer } = useGetPayerQuery(params.id);
  const [updatePayer] = useUpdatePayerMutation();

  const initialValues = useMemo<FormValues>(() => {
    if (!payer) {
      return {
        name: '',
        emails: [],
        disabled: false,
      };
    } else {
      return {
        name: payer.name,
        disabled: payer.disabled,
        emails: payer.emails,
      };
    }
  }, [payer]);

  return (
    <div>
      <h1 className="text-2xl mt-10 mb-5">
        <Breadcrumbs
          linkComponent={Link}
          segments={[
            {
              text: 'Payers',
              url: '/admin/payers',
            },
            {
              text: payer?.name ?? '',
              url: `/admin/payers/${params.id}`,
            },
            'Edit',
          ]}
        />
      </h1>
      <Formik
        enableReinitialize
        initialValues={initialValues}
        validate={(values: FormValues) => {
          const errors: Record<string, string> = {};

          const existing = new Set();
          let primaryEncountered = false;

          values.emails.forEach(({ email, priority }, i) => {
            if (priority === 'primary') {
              if (primaryEncountered) {
                errors[`emails[${i}].priority`] =
                  'Only one address can be set as the primary address';
              }

              primaryEncountered = true;
            }

            if (existing.has(email)) {
              errors[`emails.${i}.email`] = 'Duplicate address';
            }

            existing.add(email);
          });

          return errors;
        }}
        onSubmit={async values => {
          const result = await updatePayer({
            id: params.id,
            ...values,
          });

          if ('data' in result) {
            setLocation(`/admin/payers/${result.data.id.value}`);
          } else {
            return Promise.reject();
          }
        }}
      >
        {({ values, submitForm, isSubmitting, setFieldValue }) => {
          return (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-x-8">
              <InputGroup label="Name" name="name" component={TextField} />
              <div className="col-span-2 my-4 pt-[20px]">
                <div className="flex items-center mt-1 py-2.5">
                  <input
                    type="checkbox"
                    checked={values.disabled}
                    onClick={evt =>
                      setFieldValue('disabled', evt.currentTarget.checked)
                    }
                    className="w-4 cursor-pointer h-4 text-blue-600 bg-gray-100 rounded border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                    id="toggle-disabled"
                  />
                  <label
                    htmlFor="toggle-disabled"
                    className="cursor-pointer ml-2 text-sm font-medium text-gray-900 dark:text-gray-300"
                  >
                    Disable profile
                  </label>
                </div>
              </div>
              <InputGroup
                label="Emails"
                fullWidth
                name="emails"
                component={TabularFieldListFormik}
                createNew={() => ({ key: uid(), email: '', priority: 'default' })}
                columns={[
                  {
                    header: 'Address',
                    component: TextField,
                    key: 'email' as any,
                  },
                  {
                    header: 'Priority',
                    component: DropdownField,
                    key: 'priority' as any,
                    props: {
                      options: [
                        { value: 'primary', text: 'Primary' },
                        { value: 'default', text: 'Secondary' },
                        { value: 'disabled', text: 'Disabled' },
                      ],
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
