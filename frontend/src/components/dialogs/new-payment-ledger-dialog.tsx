import { endOfMonth, format, startOfMonth } from 'date-fns';
import { Formik } from 'formik';
import { DbDateString, Report } from '@bbat/common/'types';
import { useGeneratePaymentLedgerMutation } from '../../api/report';
import { Button } from '../button';
import { DateField } from '../datetime-field';
import {
  DialogBase,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '../dialog';
import { DropdownField } from '../dropdown-field';
import { ResourceSelectField } from '../resource-select-field';
import { InputGroup } from '../input-group';

type FormValues = {
  startDate: DbDateString;
  endDate: DbDateString;
  paymentType: null | 'cash' | 'invoice';
  center: null | { id: string; type: 'debt_center' };
  groupBy: null | 'payer' | 'center';
  eventTypes: null | Array<'payment' | 'created' | 'credited'>;
};

type Props = {
  onClose: (_: Report) => void;
  defaults?: Partial<Omit<FormValues, 'center'> & { center: string }>;
};

export const NewPaymentLedgerDialog = ({ onClose, defaults = {} }: Props) => {
  const [generatePaymentLedgerReport] = useGeneratePaymentLedgerMutation();

  const handleSubmit = async (values: FormValues) => {
    await generatePaymentLedgerReport({
      startDate: values.startDate,
      endDate: values.endDate,
      paymentType: values.paymentType,
      groupBy: values.groupBy,
      centers: values.center ? [values.center.id] : null,
      eventTypes: values.eventTypes,
    });
  };

  return (
    <Formik
      initialValues={
        {
          startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
          endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
          paymentType: null,
          groupBy: null,
          eventTypes: null,
          ...defaults,
          center: defaults.center
            ? { type: 'debt_center', id: defaults.center }
            : null,
        } as FormValues
      }
      onSubmit={handleSubmit}
    >
      {({ submitForm, isSubmitting }) => (
        <DialogBase onClose={() => onClose(null)}>
          <DialogHeader>Generate a new payment ledger</DialogHeader>
          <DialogContent>
            <div className="grid gap grid-cols-4 gap-x-8 px-4">
              <InputGroup
                label="Start Date"
                name="startDate"
                format="yyyy-MM-dd"
                component={DateField}
              />
              <InputGroup
                label="End Date"
                name="endDate"
                format="yyyy-MM-dd"
                component={DateField}
              />
              <InputGroup
                label="Payment Type"
                name="paymentType"
                component={DropdownField}
                options={[
                  { value: null, text: 'All' },
                  { value: 'invoice', text: 'Invoice' },
                  { value: 'cash', text: 'Cash' },
                ]}
              />
              <InputGroup
                label="Group By"
                name="groupBy"
                component={DropdownField}
                options={[
                  { value: null, text: 'No grouping' },
                  { value: 'payer', text: 'Payer' },
                  { value: 'center', text: 'Debt Center' },
                ]}
              />
              <InputGroup
                label="Event Types"
                name="eventTypes"
                component={DropdownField}
                options={[
                  { value: null, text: 'All events' },
                  { value: ['payment'], text: 'Only payments' },
                ]}
              />
              <InputGroup
                label="Debt Center"
                name="center"
                component={ResourceSelectField}
                type="debt_center"
              />
            </div>
          </DialogContent>
          <DialogFooter>
            <Button secondary onClick={() => onClose(null)}>
              Cancel
            </Button>
            <Button onClick={submitForm} loading={isSubmitting}>
              Generate
            </Button>
          </DialogFooter>
        </DialogBase>
      )}
    </Formik>
  );
};
