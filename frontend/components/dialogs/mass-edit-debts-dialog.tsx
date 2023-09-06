import {
  DialogBase,
  DialogContent,
  DialogFooter,
  DialogHeader,
  useDialog,
} from '../../components/dialog';
import { skipToken } from '@reduxjs/toolkit/query';
import { Button } from '../../components/button';
import { TextField } from '../../components/text-field';
import { DateField } from '../../components/datetime-field';
import { InputGroup } from '../input-group';
import { Formik } from 'formik';
import { uniqBy } from 'remeda';
import {
  dbDateString,
  DbDateString,
  Debt,
  DebtComponent,
  EuroValue,
} from '../../../common/types';
import { useMemo } from 'react';
import * as dfns from 'date-fns';
import {
  useGetDebtComponentsByCenterQuery,
  useUpdateMultipleDebtsMutation,
} from '../../api/debt';
import { ResourceSelectField } from '../resource-select-field';
import { TableView } from '../table-view';
import { AddTagDialog } from './add-tag-dialog';
import { isRight, left } from 'fp-ts/lib/Either';

type Props = {
  onClose: () => void;
  debts: Debt[];
};

type FormValues = {
  name: string;
  date: DbDateString | null;
  dueDate: string | null;
  debtCenter: { id: string; type: 'debt_center' } | null;
  paymentCondition: string | null;
  tags: {
    name: string;
    operation: 'noop' | 'include' | 'exclude';
  }[];
  components: {
    id: string;
    name: string;
    amount: EuroValue;
    operation: 'noop' | 'include' | 'exclude';
  }[];
};

export const MassEditDebtsDialog = ({ onClose, debts }: Props) => {
  const showAddTagDialog = useDialog(AddTagDialog);
  const [updateMultipleDebtsMutation] = useUpdateMultipleDebtsMutation();

  const commonDebtCenterId = useMemo(() => {
    if (debts.every(debt => debt.debtCenterId === debts[0].debtCenterId)) {
      return debts[0].debtCenterId;
    } else {
      return null;
    }
  }, [debts]);

  const { data: commonDebtCenterComponents } =
    useGetDebtComponentsByCenterQuery(commonDebtCenterId ?? skipToken);

  const allDebtComponents = useMemo(() => {
    if (!commonDebtCenterComponents || !debts) {
      return null;
    }

    const components = new Map();

    for (const centerComponent of commonDebtCenterComponents) {
      components.set(centerComponent.id, centerComponent);
    }

    for (const debtComponent of debts.flatMap(d => d.debtComponents)) {
      components.set(debtComponent.id, debtComponent);
    }

    return [...components.values()];
  }, [commonDebtCenterComponents, debts]);

  const componentSummary = useMemo<Array<[DebtComponent, number]>>(() => {
    if (!allDebtComponents) {
      return null;
    }

    const components: Record<string, number> = {};

    for (const { id } of allDebtComponents) {
      components[id] = 0;
    }

    for (const { id } of debts.flatMap(d => d.debtComponents)) {
      components[id] += 1;
    }

    return Object.entries(components).map(([id, count]) => [
      allDebtComponents.find(dc => dc.id === id),
      count,
    ]);
  }, [allDebtComponents, debts]);

  const tagsSummary = useMemo<Array<[string, number]>>(() => {
    const summary = new Map();

    for (const { name } of debts.flatMap(debt => debt.tags)) {
      const count = summary.get(name);

      if (count === undefined) {
        summary.set(name, 1);
      } else {
        summary.set(name, count + 1);
      }
    }

    return [...summary.entries()];
  }, [debts]);

  const initialValues = useMemo<FormValues>(() => {
    const names = uniqBy(debts, d => d.name);
    const dueDates = uniqBy(debts, d =>
      dfns.format(new Date(d.dueDate), 'dd.MM.yyyy'),
    );
    const dates = uniqBy(debts, d =>
      d.date === null ? null : dfns.format(new Date(d.date), 'dd.MM.yyyy'),
    );
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

    const tags = tagsSummary.map(([name, count]) => {
      let operation: 'noop' | 'exclude' | 'include' = 'noop';

      if (count === 0) {
        operation = 'exclude';
      } else if (count === debts.length) {
        operation = 'include';
      }

      return {
        name,
        operation,
      };
    });

    const date =
      dates.length === 1 && dates[0].date !== null
        ? dbDateString.decode(
            dfns.format(new Date(dates[0].date), 'yyyy-MM-dd'),
          )
        : left(null);

    return {
      name: names.length === 1 ? names[0].name : null,
      date: isRight(date) ? date.right : null,
      dueDate:
        dueDates.length === 1
          ? dfns.format(new Date(dueDates[0].dueDate), 'dd.MM.yyyy')
          : null,
      debtCenter:
        debtCenters.length === 1
          ? { type: 'debt_center', id: debtCenters[0].debtCenterId }
          : null,
      paymentCondition:
        paymentConditions.length === 1
          ? '' + paymentConditions[0].paymentCondition
          : null,
      components,
      tags,
    };
  }, [debts, componentSummary]);

  const onSubmit = async (values: FormValues) => {
    const date =
      values.date !== null ? dbDateString.decode(values.date) : left(null);

    const res = await updateMultipleDebtsMutation({
      debts: debts.map(d => d.id),
      values: {
        name: values.name ?? undefined,
        dueDate:
          values.dueDate === null
            ? null
            : dfns.parse(values.dueDate, 'dd.MM.yyyy', new Date()),
        date: isRight(date) ? date.right : null,
        centerId: values.debtCenter?.id,
        paymentCondition: values.paymentCondition
          ? parseInt(values.paymentCondition)
          : undefined,
        components: values.components
          .filter(({ operation }) => operation !== 'noop')
          .map(({ id, operation }) => ({ id, operation })) as any,
        tags: values.tags
          .filter(({ operation }) => operation !== 'noop')
          .map(({ name, operation }) => ({ name, operation })) as any,
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
      validate={values => {
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
                label="Date"
                name="date"
                format="yyyy-MM-dd"
                component={DateField}
              />

              <InputGroup
                label="Due Date"
                name="dueDate"
                component={DateField}
                onChange={evt => {
                  setFieldValue('dueDate', evt.target.value);
                  setFieldValue('paymentCondition', '');
                }}
              />

              <InputGroup
                label="Payment Condition"
                name="paymentCondition"
                component={TextField}
                onChange={evt => {
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

              {values.tags.length > 0 && (
                <>
                  <div className="col-span-full">
                    <span className="text-sm font-bold text-gray-800 mb-1 block">
                      Tags
                    </span>
                    <TableView
                      hideTools
                      rows={values.tags.map(c => ({ ...c, key: c.name }))}
                      columns={[
                        {
                          name: 'Name',
                          getValue: row => row.name,
                        },
                        {
                          name: 'Presence',
                          getValue: row => {
                            const count =
                              tagsSummary.find(
                                ([name]) => name === row.name,
                              )?.[1] ?? 0;

                            let noopEq = 'noop';
                            let originalPresence = 'Mixed';

                            if (count === debts.length) {
                              noopEq = 'include';
                              originalPresence = 'All';
                            } else if (count === 0) {
                              noopEq = 'exclude';
                              originalPresence = 'None';
                            }

                            let newPresence = null;

                            if (
                              row.operation !== 'noop' &&
                              row.operation !== noopEq
                            ) {
                              if (row.operation === 'include') {
                                newPresence = 'All';
                              } else if (row.operation === 'exclude') {
                                newPresence = 'None';
                              }
                            }

                            return [originalPresence, newPresence];
                          },
                          render: ([originalPresence, newPresence]) => (
                            <>
                              <span
                                className={`${
                                  newPresence !== null
                                    ? 'line-through text-gray-500 bg-gray-200'
                                    : 'bg-gray-300'
                                } px-1.5 text-sm rounded-sm`}
                              >
                                {originalPresence}
                              </span>
                              {newPresence !== null && (
                                <span
                                  className={`ml-1.5 ${
                                    newPresence === 'All'
                                      ? 'bg-green-500'
                                      : 'bg-red-500'
                                  } text-white px-1.5 text-sm rounded-sm`}
                                >
                                  {newPresence}
                                </span>
                              )}
                            </>
                          ),
                        },
                        {
                          name: '',
                          getValue: row => row,
                          render: row => (
                            <div className="flex gap-2">
                              {(row.operation === 'noop' ||
                                row.operation === 'exclude') && (
                                <Button
                                  small
                                  className="bg-green-500 hover:bg-green-400"
                                  onClick={() => {
                                    const i = values.tags.findIndex(
                                      t => t.name === row.name,
                                    );
                                    setFieldValue(
                                      `tags.${i}.operation`,
                                      'include',
                                    );
                                  }}
                                >
                                  Add
                                </Button>
                              )}
                              {(row.operation === 'noop' ||
                                row.operation === 'include') && (
                                <Button
                                  small
                                  className="bg-red-500 hover:bg-red-400"
                                  onClick={() => {
                                    const i = values.tags.findIndex(
                                      t => t.name === row.name,
                                    );
                                    setFieldValue(
                                      `tags.${i}.operation`,
                                      'exclude',
                                    );
                                  }}
                                >
                                  Remove
                                </Button>
                              )}
                              {row.operation !== 'noop' && (
                                <Button
                                  small
                                  secondary
                                  onClick={() => {
                                    const i = values.tags.findIndex(
                                      t => t.name === row.name,
                                    );
                                    setFieldValue(
                                      `tags.${i}.operation`,
                                      'noop',
                                    );
                                  }}
                                >
                                  Clear
                                </Button>
                              )}
                            </div>
                          ),
                        },
                      ]}
                      actions={
                        undefined /*[
                        {
                          key: 'include',
                          text: 'Include',
                          disabled: (row) => row?.operation === 'include',
                          onSelect: (rows) => {
                            for (const row of rows) {
                              const index = values.tags.findIndex((t) => t.name === row.name);
                              setFieldValue(`tags.${index}.operation`, 'include');
                            }
                          },
                        },
                        {
                          key: 'exclude',
                          text: 'Exclude',
                          disabled: (row) => row?.operation === 'exclude',
                          onSelect: (rows) => {
                            for (const row of rows) {
                              const index = values.tags.findIndex((t) => t.name === row.name);
                              setFieldValue(`tags.${index}.operation`, 'exclude');
                            }
                          },
                        },
                        {
                          key: 'clear',
                          text: 'Clear',
                          disabled: (row) => row?.operation === 'noop',
                          onSelect: (rows) => {
                            for (const row of rows) {
                              const index = values.tags.findIndex((t) => t.name === row.name);
                              setFieldValue(`name.${index}.operation`, 'noop');
                            }
                          },
                        },
                      ]*/
                      }
                      footer={
                        <Button
                          small
                          onClick={async () => {
                            const result = await showAddTagDialog({});

                            if (result) {
                              setFieldValue('tags', [
                                ...values.tags,
                                { name: result.name, operation: 'include' },
                              ]);
                            }
                          }}
                        >
                          Add
                        </Button>
                      }
                    />
                  </div>
                </>
              )}

              {values.components.length > 0 && (
                <>
                  <div className="col-span-full mt-3">
                    <span className="text-sm font-bold text-gray-800 mb-1 block">
                      Components
                    </span>
                    <TableView
                      hideTools
                      footer={false}
                      rows={values.components.map(c => ({ ...c, key: c.id }))}
                      columns={[
                        {
                          name: 'Name',
                          getValue: component => component.name,
                        },
                        {
                          name: 'Presence',
                          getValue: component => {
                            const count = componentSummary.find(
                              ([{ id }]) => id === component.id,
                            )[1];

                            let noopEq = 'noop';
                            let originalPresence = 'Mixed';

                            if (count === debts.length) {
                              noopEq = 'include';
                              originalPresence = 'All';
                            } else if (count === 0) {
                              noopEq = 'exclude';
                              originalPresence = 'None';
                            }

                            let newPresence = null;

                            if (
                              component.operation !== 'noop' &&
                              component.operation !== noopEq
                            ) {
                              if (component.operation === 'include') {
                                newPresence = 'All';
                              } else if (component.operation === 'exclude') {
                                newPresence = 'None';
                              }
                            }

                            return [originalPresence, newPresence];
                          },
                          render: ([originalPresence, newPresence]) => (
                            <>
                              <span
                                className={`${
                                  newPresence !== null
                                    ? 'line-through text-gray-500 bg-gray-200'
                                    : 'bg-gray-300'
                                } px-1.5 text-sm rounded-sm`}
                              >
                                {originalPresence}
                              </span>
                              {newPresence !== null && (
                                <span
                                  className={`ml-1.5 ${
                                    newPresence === 'All'
                                      ? 'bg-green-500'
                                      : 'bg-red-500'
                                  } text-white px-1.5 text-sm rounded-sm`}
                                >
                                  {newPresence}
                                </span>
                              )}
                            </>
                          ),
                        },
                        {
                          name: '',
                          getValue: row => row,
                          render: row => (
                            <div className="flex gap-2">
                              {(row.operation === 'noop' ||
                                row.operation === 'exclude') && (
                                <Button
                                  small
                                  className="bg-green-500 hover:bg-green-400"
                                  onClick={() => {
                                    const i = values.components.findIndex(
                                      t => t.id === row.id,
                                    );
                                    setFieldValue(
                                      `components.${i}.operation`,
                                      'include',
                                    );
                                  }}
                                >
                                  Add
                                </Button>
                              )}
                              {(row.operation === 'noop' ||
                                row.operation === 'include') && (
                                <Button
                                  small
                                  className="bg-red-500 hover:bg-red-400"
                                  onClick={() => {
                                    const i = values.components.findIndex(
                                      t => t.id === row.id,
                                    );
                                    setFieldValue(
                                      `components.${i}.operation`,
                                      'exclude',
                                    );
                                  }}
                                >
                                  Remove
                                </Button>
                              )}
                              {row.operation !== 'noop' && (
                                <Button
                                  small
                                  secondary
                                  onClick={() => {
                                    const i = values.components.findIndex(
                                      t => t.id === row.id,
                                    );
                                    setFieldValue(
                                      `components.${i}.operation`,
                                      'noop',
                                    );
                                  }}
                                >
                                  Clear
                                </Button>
                              )}
                            </div>
                          ),
                        },
                      ]}
                      actions={
                        undefined /*[
                        {
                          key: 'include',
                          text: 'Include',
                          disabled: (row) => row.operation === 'include',
                          onSelect: (rows) => {
                            for (const row of rows) {
                              const index = values.components.findIndex((c) => c.id === row.id);
                              setFieldValue(`components.${index}.operation`, 'include');
                            }
                          },
                        },
                        {
                          key: 'exclude',
                          text: 'Exclude',
                          disabled: (row) => row.operation === 'exclude',
                          onSelect: (rows) => {
                            for (const row of rows) {
                              const index = values.components.findIndex((c) => c.id === row.id);
                              setFieldValue(`components.${index}.operation`, 'exclude');
                            }
                          },
                        },
                        {
                          key: 'clear',
                          text: 'Clear',
                          disabled: (row) => row.operation === 'noop',
                          onSelect: (rows) => {
                            for (const row of rows) {
                              const index = values.components.findIndex((c) => c.id === row.id);
                              setFieldValue(`components.${index}.operation`, 'noop');
                            }
                          },
                        },
                      ]*/
                      }
                    />
                  </div>
                </>
              )}
            </div>
          </DialogContent>
          <DialogFooter>
            <Button secondary onClick={() => onClose()}>
              Cancel
            </Button>
            <Button
              disabled={!isValid}
              loading={isSubmitting}
              onClick={() => submitForm()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogBase>
      )}
    </Formik>
  );
};
