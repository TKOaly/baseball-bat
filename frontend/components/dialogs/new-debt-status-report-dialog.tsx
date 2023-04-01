import { endOfMonth, format, startOfMonth } from "date-fns";
import { Formik } from "formik";
import { DbDateString, Report } from "../../../common/types";
import { useGenerateDebtStatusReportMutation } from "../../api/report";
import { Button } from "../button";
import { DateField } from "../datetime-field";
import { DialogBase, DialogContent, DialogFooter, DialogHeader } from "../dialog";
import { DropdownField } from "../dropdown-field";
import { ResourceSelectField } from '../resource-select-field';
import { InputGroup } from "../input-group";

type FormValues = {
  date: DbDateString,
  groupBy: null | 'payer' | 'center',
  center: null | { id: string }
}

export const NewDebtStatusReportDialog = ({ onClose, defaults = {} }: { onClose: (result: Report) => void, defaults?: Omit<Partial<FormValues>, 'center'> & { center?: string } }) => {
  const [generateDebtStatusReportMutation] = useGenerateDebtStatusReportMutation();

  const handleSubmit = async (values: FormValues) => {
    const result = await generateDebtStatusReportMutation({
      date: values.date,
      groupBy: values.groupBy,
      centers: values.center ? [values.center.id] : null,
    });

    if ('data' in result) {
      onClose(result.data);
    }
  };

  return (
    <Formik
      initialValues={{
        date: format(new Date(), 'yyyy-MM-dd'),
        groupBy: 'center',
        ...defaults,
        center: defaults.center ? { type: 'debt_center', id: defaults.center } : null,
      } as FormValues}
      onSubmit={handleSubmit}
    >
      {({ submitForm, isSubmitting }) => (
        <DialogBase onClose={() => onClose(null)}>
          <DialogHeader>Generate a new debt ledger</DialogHeader>
          <DialogContent>
            <div className="grid gap grid-cols-4 gap-x-8 px-4">
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
                label="Debt Center"
                name="center"
                component={ResourceSelectField}
                type="debt_center"
              />
            </div>
          </DialogContent>
          <DialogFooter>
            <Button secondary onClick={() => onClose(null)}>Cancel</Button>
            <Button onClick={submitForm} loading={isSubmitting}>Generate</Button>
          </DialogFooter>
        </DialogBase>
      )}
    </Formik>
  );
};