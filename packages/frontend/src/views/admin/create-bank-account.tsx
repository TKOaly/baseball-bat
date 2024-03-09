import { Breadcrumbs } from '@bbat/ui/breadcrumbs';
import { useCreateBankAccountMutation } from '../../api/banking/accounts';
import { TextField } from '@bbat/ui/text-field';
import { Formik } from 'formik';
import { Link, useLocation } from 'wouter';
import { BankAccount } from '@bbat/common/src/types';
import { InputGroup } from '../../components/input-group';

export const CreateBankAccount = () => {
  const [, setLocation] = useLocation();
  const [createBankAccount] = useCreateBankAccountMutation();

  const submitForm = async (values: BankAccount) => {
    const result = await createBankAccount(values);

    if ('data' in result) {
      setLocation(`/admin/banking/accounts/${result.data.iban}`);
    }
  };

  return (
    <div>
      <h1 className="mb-5 mt-10 text-2xl">
        <Breadcrumbs
          linkComponent={Link}
          segments={[
            {
              text: 'Banking',
              url: '/admin/banking',
            },
            {
              text: 'Accounts',
              url: '/admin/banking/accounts',
            },
            'Create',
          ]}
        />
      </h1>
      <Formik
        initialValues={
          {
            name: '',
            iban: '',
          } as BankAccount
        }
        onSubmit={submitForm}
      >
        {({ submitForm, isSubmitting }) => (
          <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
            <InputGroup label="Name" name="name" component={TextField} />
            <InputGroup label="IBAN" name="iban" component={TextField} />
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
