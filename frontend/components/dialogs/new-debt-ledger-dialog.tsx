import { endOfMonth, format, startOfMonth } from "date-fns";
import { Formik } from "formik";
import { DbDateString } from "../../../common/types";
import { useGenerateDebtLedgerMutation } from "../../api/report";
import { Button } from "../button";
import { DateField } from "../datetime-field";
import { DialogBase, DialogContent, DialogFooter, DialogHeader } from "../dialog";
import { DropdownField } from "../dropdown-field";
import { InputGroup, StandaloneInputGroup } from "../input-group";

type FormValues = {
  startDate: DbDateString,
  endDate: DbDateString,
  includeDrafts: boolean,
  groupBy: null | 'payer' | 'center',
}

export const NewDebtLedgerDialog = ({ onClose }) => {
  const [generateDebtLedgerReport] = useGenerateDebtLedgerMutation();

  const handleSubmit = async (values: FormValues) => {
    const result = await generateDebtLedgerReport(values);
  };

  return (
    <Formik
      initialValues={{
        startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
        includeDrafts: false,
        groupBy: 'center',
      } as FormValues}
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
                  { value: false, text: 'Exclude' },
                  { value: true, text: 'Include' },
                ]}
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
