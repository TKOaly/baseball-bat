import format from 'date-fns/format';
import { Formik } from 'formik';
import { DbDateString, Report } from '@bbat/common/src/types';
import { useGenerateDebtStatusReportMutation } from '../../api/report';
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
  date: DbDateString;
  groupBy: null | 'payer' | 'center';
  center: null | { id: string };
  includeOnly: null | 'open' | 'paid' | 'credited';
};

export const NewDebtStatusReportDialog = ({
  onClose,
  defaults = {},
}: {
  onClose: (result: Report | null) => void;
  defaults?: Omit<Partial<FormValues>, 'center'> & { center?: string };
}) => {
  const [generateDebtStatusReportMutation] =
    useGenerateDebtStatusReportMutation();

  const handleSubmit = async (values: FormValues) => {
    const result = await generateDebtStatusReportMutation({
      date: values.date,
      groupBy: values.groupBy,
      centers: values.center ? [values.center.id] : null,
      includeOnly: values.includeOnly,
    });

    if ('data' in result) {
      onClose(result.data);
    }
  };

  return (
    <Formik
      initialValues={
        {
          date: format(new Date(), 'yyyy-MM-dd'),
          groupBy: 'center',
          includeOnly: null,
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
          <DialogHeader>Generate a new debt status report</DialogHeader>
          <DialogContent>
            <div className="gap grid grid-cols-4 gap-x-8 px-4">
              <InputGroup
                label="Date"
                name="date"
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
                label="Include only"
                name="includeOnly"
                component={DropdownField}
                options={[
                  { value: null, text: 'All' },
                  { value: 'open', text: 'Open' },
                  { value: 'paid', text: 'Paid' },
                  { value: 'credited', text: 'Credited' },
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
