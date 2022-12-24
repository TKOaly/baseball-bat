import { DialogBase, DialogContent, DialogFooter, DialogHeader } from '../../components/dialog';
import { skipToken } from '@reduxjs/toolkit/query';
import { Button } from '../../components/button';
import { TextField } from '../../components/text-field';
import { DateField } from '../../components/datetime-field';
import { InputGroup } from '../input-group';
import { Formik } from 'formik';
import { uniqBy } from 'remeda';
import { Debt, DebtComponent, EuroValue } from '../../../common/types';
import { useMemo } from 'react';
import * as dfns from 'date-fns';
import { useGetDebtComponentsByCenterQuery, useUpdateMultipleDebtsMutation } from '../../api/debt';
import { ResourceSelectField } from '../resource-select-field';
import { TabularFieldListFormik } from '../tabular-field-list';
import { EuroField } from '../euro-field';
import { DropdownField } from '../dropdown-field';

type Props = {
  onClose: () => void,
  debts: Debt[],
}

type FormValues = {
  name: string
  dueDate: string | null
  debtCenter: { id: string, type: 'debt_center' } | null
  paymentCondition: string | null
  components: {
    id: string,
    name: string,
    amount: EuroValue,
    operation: 'noop' | 'include' | 'exclude',
  }[],
}

export const MassEditDebtsDialog = ({ onClose, debts }: Props) => {
  const [updateMultipleDebtsMutation] = useUpdateMultipleDebtsMutation();

  const commonDebtCenterId = useMemo(() => {
    if (debts.every((debt) => debt.debtCenterId === debts[0].debtCenterId)) {
      return debts[0].debtCenterId;
    } else {
      return null;
    }
  }, [debts]);

  const { data: commonDebtCenterComponents } = useGetDebtComponentsByCenterQuery(commonDebtCenterId ?? skipToken);

  const componentSummary = useMemo<Array<[DebtComponent, number]>>(() => {
    if (!commonDebtCenterComponents) {
      return null;
    }

    const components: Record<string, number> = {};

    for (const { id } of commonDebtCenterComponents) {
      components[id] = 0;
    }

    for (const { id } of debts.flatMap(d => d.debtComponents)) {
      components[id] += 1;
    }

    return Object.entries(components)
      .map(([id, count]) => [commonDebtCenterComponents.find(dc => dc.id === id), count]);
  }, [commonDebtCenterComponents, debts]);

  const initialValues = useMemo<FormValues>(() => {
    const names = uniqBy(debts, d => d.name);
    const dueDates = uniqBy(debts, d => dfns.format(new Date(d.dueDate), 'dd.MM.yyyy'));
    const paymentConditions = uniqBy(debts, d => d.paymentCondition);
    const debtCenters = uniqBy(debts, d => d.debtCenterId);
    let components = [];

    if (componentSummary) {
      components = componentSummary.map(([{ id, name, amount }, count]) => {
        let operation: 'noop' | 'include' | 'exclude' = 'noop';

        if (count === debts.length) {
          operation = 'include';
        } else if (count === 0) {
          operation = 'exclude';
        }

        return {
          id,
          name,
          amount,
          operation,
        };
      });
    }

    return {
      name: names.length === 1 ? names[0].name : null,
      dueDate: dueDates.length === 1 ? dfns.format(new Date(dueDates[0].dueDate), 'dd.MM.yyyy') : null,
      debtCenter: debtCenters.length === 1 ? { type: 'debt_center', id: debtCenters[0].debtCenterId } : null,
      paymentCondition: paymentConditions.length === 1 ? '' + paymentConditions[0].paymentCondition : null,
      components,
    };
  }, [debts, componentSummary]);

  const onSubmit = async (values: FormValues) => {
    const res = await updateMultipleDebtsMutation({
      debts: debts.map(d => d.id),
      values: {
        name: values.name ?? undefined,
        dueDate: values.dueDate === null ? null : dfns.parse(values.dueDate, 'dd.MM.yyyy', new Date()),
        centerId: values.debtCenter?.id,
        paymentCondition: values.paymentCondition ? parseInt(values.paymentCondition) : undefined,
        components: values.components
          .filter(({ operation }) => operation !== 'noop')
          .map(({ id, operation }) => ({ id, operation })) as any,
      },
    });

    if ('data' in res) {
      onClose();
    }
  };

  return (
    <Formik
      enableReinitialize
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

              { values.components.length > 0 && (
                <InputGroup
                  label="Components"
                  name="components"
                  fullWidth
                  component={TabularFieldListFormik}
                  disableRemove
                  columns={[
                    {
                      header: 'Component',
                      key: 'name',
                      component: TextField,
                      props: {
                        readOnly: true,
                      },
                    },
                    /*{
                      header: 'Amount',
                      key: 'amount',
                      component: EuroField,
                      props: {
                        readOnly: true,
                      },
                    },*/
                    {
                      header: 'Action',
                      key: 'operation',
                      component: DropdownField,
                      props: {
                        options: [
                          {
                            value: 'include',
                            text: 'Include',
                          },
                          {
                            value: 'exclude',
                            text: 'Exclude',
                          },
                          {
                            value: 'noop',
                            text: 'Nothing',
                          },
                        ],
                        allowCustom: false,
                      },
                    },
                  ]}
                />
              )}
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
