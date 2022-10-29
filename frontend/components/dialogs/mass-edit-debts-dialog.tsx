import { DialogBase, DialogContent, DialogFooter, DialogHeader } from '../../components/dialog'
import { Button, SecondaryButton } from '../../components/button'
import { TextField } from '../../components/text-field'
import { DateField } from '../../components/datetime-field'
import { InputGroup } from '../input-group'
import { Formik } from 'formik'
import { uniqBy } from 'remeda'
import { Debt } from '../../../common/types'
import { useMemo } from 'react'
import * as dfns from 'date-fns'
import { useUpdateMultipleDebtsMutation } from '../../api/debt'

type Props = {
  onClose: () => void,
  debts: Debt[],
}

type FormValues = {
  name: string
  dueDate: string | null
}

export const MassEditDebtsDialog = ({ onClose, debts }: Props) => {
  const [updateMultipleDebtsMutation] = useUpdateMultipleDebtsMutation()

  const initialValues = useMemo<FormValues>(() => {
    const names = uniqBy(debts, d => d.name)
    const dueDates = uniqBy(debts, d => dfns.format(new Date(d.dueDate), 'dd.MM.yyyy'))

    return {
      name: names.length === 1 ? names[0].name : '',
      dueDate: dueDates.length === 1 ? dfns.format(new Date(dueDates[0].dueDate), 'dd.MM.yyyy') : null,
    }
  }, [debts])

  const onSubmit = async (values: FormValues) => {
    const res = await updateMultipleDebtsMutation({
      debts: debts.map(d => d.id),
      values: {
        ...values,
        dueDate: values.dueDate === null ? null : dfns.parse(values.dueDate, 'dd.MM.yyyy', new Date()),
      },
    });

    if ('data' in res) {
      onClose();
    }
  }

  return (
    <Formik
      initialValues={initialValues}
      onSubmit={onSubmit}
    >
      {({ submitForm }) => (
        <DialogBase onClose={() => onClose()}>
          <DialogHeader>Edit {debts.length} debts</DialogHeader>
          <DialogContent>
            <InputGroup
              label="Name"
              name="name"
              component={TextField}
            />

            <InputGroup
              label="Due Date"
              name="dueDate"
              component={DateField}
            />
          </DialogContent>
          <DialogFooter>
            <SecondaryButton onClick={() => onClose()}>Cancel</SecondaryButton>
            <Button onClick={() => submitForm()}>Save</Button>
          </DialogFooter>
        </DialogBase>
      )}
    </Formik>
  )
}
