import {
  DialogBase,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '../dialog';
import { Button } from '../button';
import { Formik } from 'formik';
import { PayerProfile } from '@bbat/common/src/types';
import { InputGroup } from '../input-group';
import { TextField } from '../text-field';
import { useCreatePayerMutation } from '../../api/payers';

export type Props = {
  onClose: (result: PayerProfile) => void;
  name?: string;
  email?: string;
};

export const CreatePayerDialog = ({ onClose, name, email }: Props) => {
  const [createPayer] = useCreatePayerMutation();

  const handleSubmit = async (values: { name: string; email: string }) => {
    const result = await createPayer(values);

    if ('data' in result) {
      onClose(result.data);
    }
  };

  return (
    <Formik
      initialValues={{
        name,
        email,
      }}
      onSubmit={handleSubmit}
    >
      {({ submitForm, isSubmitting }) => (
        <DialogBase onClose={() => onClose(null)}>
          <DialogHeader>New payer</DialogHeader>
          <DialogContent>
            <div className="grid gap grid-cols-4 gap-x-8 px-4">
              <InputGroup
                label="Payer name"
                name="name"
                component={TextField}
              />
              <InputGroup
                label="Email address"
                name="email"
                component={TextField}
              />
            </div>
          </DialogContent>
          <DialogFooter>
            <Button onClick={submitForm} loading={isSubmitting}>
              Create
            </Button>
          </DialogFooter>
        </DialogBase>
      )}
    </Formik>
  );
};
