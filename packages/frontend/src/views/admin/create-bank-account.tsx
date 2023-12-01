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
      <h1 className="text-2xl mt-10 mb-5">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <InputGroup label="Name" name="name" component={TextField} />
            <InputGroup label="IBAN" name="iban" component={TextField} />
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
        )}
      </Formik>
    </div>
  );
};
