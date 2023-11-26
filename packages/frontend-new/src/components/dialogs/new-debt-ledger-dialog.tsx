import { endOfMonth, format, startOfMonth } from 'date-fns';
import { Formik } from 'formik';
import { DbDateString, Report } from '@bbat/common/src/types';
import { useGenerateDebtLedgerMutation } from '../../api/report';
import { Button } from '@bbat/ui/button';
import { DateField } from '@bbat/ui/datetime-field';
import {
  DialogBase,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '../dialog';
import { DropdownField } from '@bbat/ui/dropdown-field';
import { ResourceSelectField } from '../resource-select-field';
import { InputGroup } from '../input-group';

type FormValues = {
  startDate: DbDateString;
  endDate: DbDateString;
  includeDrafts: 'exclude' | 'include' | 'only-drafts';
  groupBy: null | 'payer' | 'center';
  center: null | { id: string };
};

export const NewDebtLedgerDialog = ({
  onClose,
  defaults = {},
}: {
  onClose: (result: Report | null) => void;
  defaults?: Omit<Partial<FormValues>, 'center'> & { center?: string };
}) => {
  const [generateDebtLedgerReport] = useGenerateDebtLedgerMutation();

  const handleSubmit = async (values: FormValues) => {
    const result = await generateDebtLedgerReport({
      startDate: values.startDate,
      endDate: values.endDate,
      includeDrafts: values.includeDrafts,
      groupBy: values.groupBy,
      centers: values.center ? [values.center.id] : null,
    });

    if ('data' in result) {
      onClose(result.data);
    }
  };

  return (
    <Formik
      initialValues={
        {
          startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
          endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
          includeDrafts: 'exclude',
          groupBy: 'center',
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
          <DialogHeader>Generate a new debt ledger</DialogHeader>
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
                label="Drafts"
                name="includeDrafts"
                component={DropdownField}
                options={[
                  { value: 'exclude', text: 'Exclude' },
                  { value: 'include', text: 'Include' },
                  { value: 'only-drafts', text: 'Only drafts' },
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
