import { DialogBase, DialogContent, DialogFooter, DialogHeader } from '../../components/dialog';
import { Button } from '../../components/button';
import { TextField } from '../../components/text-field';
import { DateField } from '../../components/datetime-field';
import { InputGroup } from '../input-group';
import { Formik } from 'formik';
import { uniqBy } from 'remeda';
import { Debt } from '../../../common/types';
import { useMemo } from 'react';
import * as dfns from 'date-fns';
import { useUpdateMultipleDebtsMutation } from '../../api/debt';
import { ResourceSelectField } from '../resource-select-field';

type Props = {
  onClose: () => void,
  debts: Debt[],
}

type FormValues = {
  name: string
  dueDate: string | null
  debtCenter: { id: string, type: 'debt_center' } | null
  paymentCondition: string | null
}

export const MassEditDebtsDialog = ({ onClose, debts }: Props) => {
  const [updateMultipleDebtsMutation] = useUpdateMultipleDebtsMutation();

  const initialValues = useMemo<FormValues>(() => {
    const names = uniqBy(debts, d => d.name);
    const dueDates = uniqBy(debts, d => dfns.format(new Date(d.dueDate), 'dd.MM.yyyy'));
    const paymentConditions = uniqBy(debts, d => d.paymentCondition);
    const debtCenters = uniqBy(debts, d => d.debtCenterId);

    return {
      name: names.length === 1 ? names[0].name : null,
      dueDate: dueDates.length === 1 ? dfns.format(new Date(dueDates[0].dueDate), 'dd.MM.yyyy') : null,
      debtCenter: debtCenters.length === 1 ? { type: 'debt_center', id: debtCenters[0].debtCenterId } : null,
      paymentCondition: paymentConditions.length === 1 ? '' + paymentConditions[0].paymentCondition : null,
    };
  }, [debts]);

  const onSubmit = async (values: FormValues) => {
    const res = await updateMultipleDebtsMutation({
      debts: debts.map(d => d.id),
      values: {
        name: values.name ?? undefined,
        dueDate: values.dueDate === null ? null : dfns.parse(values.dueDate, 'dd.MM.yyyy', new Date()),
        centerId: values.debtCenter?.id,
        paymentCondition: values.paymentCondition ? parseInt(values.paymentCondition) : undefined,
      },
    });

    if ('data' in res) {
      onClose();
    }
  };

  return (
    <Formik
      initialValues={initialValues}
      onSubmit={onSubmit}
      validate={(values) => {
        if (values.debtCenter === null) {
          return { debtCenter: 'Debt center is required' };
        }

        try {
          if (values.paymentCondition !== null) {
            parseInt(values.paymentCondition);
          }
        } catch (err) {
          return { paymentCondition: 'Must be an integer' };
        }

        return {};
      }}
    >
      {({ submitForm, isSubmitting, values, isValid, setFieldValue }) => (
        <DialogBase onClose={() => onClose()}>
          <DialogHeader>Edit {debts.length} debts</DialogHeader>
          <DialogContent>
            <div className="grid gap grid-cols-4 gap-x-8 px-4">
              <InputGroup
                fullWidth
                label="Name"
                name="name"
                component={TextField}
              />

              <InputGroup
                label="Due Date"
                name="dueDate"
                component={DateField}
                onChange={(evt) => {
                  setFieldValue('dueDate', evt.target.value);
                  setFieldValue('paymentCondition', '');
                }}
              />

              <InputGroup
                label="Payment Condition"
                name="paymentCondition"
                component={TextField}
                onChange={(evt) => {
                  setFieldValue('paymentCondition', evt.target.value);
                  setFieldValue('dueDate', '');
                }}
              />

              <InputGroup
                label="Collection"
                name="debtCenter"
                fullWidth
                component={ResourceSelectField}
                type="debt_center"
              />
            </div>
          </DialogContent>
          <DialogFooter>
            <Button secondary onClick={() => onClose()}>Cancel</Button>
            <Button disabled={!isValid} loading={isSubmitting} onClick={() => submitForm()}>Save</Button>
          </DialogFooter>
        </DialogBase>
      )}
    </Formik>
  );
};
