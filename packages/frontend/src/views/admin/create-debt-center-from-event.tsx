import { useEffect, useState, useMemo, useReducer } from 'react';
import { produce } from 'immer';
import { Circle, Search, X } from 'react-feather';
import { Table } from '@bbat/ui/table';
import { Breadcrumbs } from '@bbat/ui/breadcrumbs';
import { Stepper } from '../../components/stepper';
import {
  CustomField,
  dateString,
  DebtComponent,
  euro,
  Event,
  Registration,
} from '@bbat/common/src/types';
import { TextField } from '@bbat/ui/text-field';
import eventsApi, { useGetEventsQuery } from '../../api/events';
import { addDays } from 'date-fns/addDays';
import { format } from 'date-fns/format';
import { isMatch } from 'date-fns/isMatch';
import { subYears } from 'date-fns/subYears';
import { FilledDisc } from '@bbat/ui/filled-disc';
import { EuroField } from '../../components/euro-field';
import { InputGroup, StandaloneInputGroup } from '../../components/input-group';
import { Textarea } from '@bbat/ui/textarea';
import { Formik } from 'formik';
import { DropdownField } from '@bbat/ui/dropdown-field';
import { Button, DisabledButton } from '@bbat/ui/button';
import { RootState, useAppDispatch, useAppSelector } from '../../store';
import { createSelector } from '@reduxjs/toolkit';
import { useCreateDebtCenterFromEventMutation } from '../../api/debt-centers';
import { DateField } from '@bbat/ui/datetime-field';
import { Link, useLocation } from 'wouter';
import {
  EuroValue,
  formatEuro,
  sumEuroValues,
} from '@bbat/common/src/currency';
import { useGetAccountingPeriodsQuery } from '../../api/accounting';
import * as t from 'io-ts';
import { isLeft } from 'fp-ts/Either';
import {
  ApiEndpointQuery,
  QueryArgFrom,
  ResultTypeFrom,
} from '@reduxjs/toolkit/query/react';
import {
  DialogBase,
  DialogContent,
  DialogFooter,
  DialogHeader,
  useDialog,
} from '../../components/dialog';

type EventSelectionViewProps = {
  state: State;
  dispatch: (action: Action) => void;
};

const EventSelectionView = ({ state, dispatch }: EventSelectionViewProps) => {
  const starting = useMemo(() => subYears(new Date(), 1), []);

  const { data: events } = useGetEventsQuery({
    starting,
  });

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(state.eventIds);

  const handleSelect = (event: Event) =>
    setSelected(prev => {
      const index = prev.indexOf(event.id);

      if (index === -1) {
        return [...prev, event.id];
      } else {
        const clone = [...prev];
        clone.splice(index, 1);
        return clone;
      }
    });

  return (
    <>
      <div className="flex items-center gap-5">
        <TextField
          value={search}
          onChange={evt => setSearch(evt.target.value)}
          placeholder="Search events"
          iconRight={<Search />}
          className="my-5 flex-grow"
        />
        {selected.length === 0 ? (
          <DisabledButton className="mt-1 h-[40px]">Continue</DisabledButton>
        ) : (
          <Button
            className="mt-1 h-[40px]"
            onClick={() =>
              dispatch({
                type: 'SELECT_EVENTS',
                payload: { eventIds: selected },
              })
            }
          >
            Continue
          </Button>
        )}
      </div>
      {(events ?? [])
        .filter(
          e =>
            search === '' ||
            e.name.toLowerCase().indexOf(search.toLowerCase()) > -1,
        )
        .map(event => (
          <div
            role="button"
            aria-label={event.name}
            className={`mt-2 flex cursor-pointer items-center rounded-md border bg-white p-3 shadow-sm hover:border-blue-400 ${
              selected.indexOf(event.id) > -1 && 'border-blue-400'
            }`}
            onClick={() => handleSelect(event)}
            key={event.id}
          >
            {selected.indexOf(event.id) === -1 ? (
              <Circle
                className="mr-3 text-gray-400"
                style={{ width: '1em', strokeWidth: '2.5px' }}
              />
            ) : (
              <FilledDisc
                className="mr-3 text-blue-500"
                style={{ width: '1em', strokeWidth: '2.5px' }}
              />
            )}
            <h3 className="">{event.name}</h3>
            <div className="flex-grow" />
            <span>{format(new Date(event.starts), 'dd.MM.yyyy')}</span>
          </div>
        ))}
    </>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EndpointDefinitionFrom<E> =
  E extends ApiEndpointQuery<infer D, any> ? D : never;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMultiFetchHook<E extends ApiEndpointQuery<any, any>>(
  endpoint: E,
): (
  params: QueryArgFrom<EndpointDefinitionFrom<E>>[],
) => ResultTypeFrom<EndpointDefinitionFrom<E>>[] | null {
  const selectMultipleCustomFieldQueries = createSelector(
    [
      (state: RootState) => state,
      (_state: RootState, params: QueryArgFrom<EndpointDefinitionFrom<E>>[]) =>
        params,
    ],
    (state: RootState, params: QueryArgFrom<EndpointDefinitionFrom<E>>[]) =>
      params.map(param => endpoint.select(param)(state)),
  );

  return params => {
    const [results, setResults] = useState<
      ResultTypeFrom<EndpointDefinitionFrom<E>>[] | null
    >(null);

    const dispatch = useAppDispatch();

    useEffect(() => {
      params.forEach(param => {
        const result = dispatch(endpoint.initiate(param));
        result.unsubscribe();
      });
    }, [params]);

    const queries = useAppSelector(state =>
      selectMultipleCustomFieldQueries(state, params),
    );

    useEffect(() => {
      if (queries.every(s => s.isSuccess)) {
        setResults(queries.map(query => query.data as any));
      }
    }, [queries]);

    return results;
  };
}

const useFetchEventCustomFields = createMultiFetchHook(
  eventsApi.endpoints.getEventCustomFields,
);
const useFetchEventRegistrations = createMultiFetchHook(
  eventsApi.endpoints.getEventRegistrations,
);

type PricingRuleModalResult = {
  eventId: number;
  customFieldId: number;
  value: string;
};

type PricingRuleModalProps = {
  events: Event[];
  fields: Map<number, CustomField[]>;
  onClose: (result: PricingRuleModalResult | null) => void;
};

const PricingRuleModal = ({
  events,
  fields,
  onClose,
}: PricingRuleModalProps) => {
  type Values = {
    eventId: number | null;
    customFieldId: number | null;
    value: string | null;
  };

  const handleSubmit = (values: Values) => {
    if (
      values.value === null ||
      values.eventId === null ||
      values.customFieldId === null
    ) {
      return;
    }

    onClose({
      value: values.value,
      eventId: values.eventId,
      customFieldId: values.customFieldId,
    });
  };

  const getFieldOptions = (values: Values) => {
    if (values.eventId === null || !fields.has(values.eventId)) {
      return [];
    }

    return fields.get(values.eventId)!.map(field => ({
      value: field.id,
      text: field.name,
    }));
  };

  const getAnswerOptions = (values: Values) => {
    if (values.eventId === null) {
      return [];
    }

    const eventFields = fields.get(values.eventId);

    if (eventFields === undefined) {
      return [];
    }

    const field = eventFields.find(f => f.id === values.customFieldId);

    if (field === undefined) {
      return [];
    }

    return field.options.map(option => ({
      value: option,
      text: option,
    }));
  };

  return (
    <Formik
      initialValues={
        {
          eventId: null,
          customFieldId: null,
          value: null,
        } as Values
      }
      validate={values => {
        const errors: Record<string, string> = {};

        if (values.eventId === null) {
          errors.eventId = 'Required';
        }

        if (values.customFieldId === null) {
          errors.customFieldId = 'Required';
        }

        return errors;
      }}
      onSubmit={handleSubmit}
    >
      {({ values, submitForm }) => (
        <DialogBase onClose={() => onClose(null)}>
          <DialogHeader>Add pricing rule</DialogHeader>
          <DialogContent>
            <InputGroup
              label="Event"
              name="eventId"
              component={DropdownField}
              options={events.map(event => ({
                value: event.id,
                text: event.name,
              }))}
            />
            <InputGroup
              label="Question"
              name="customFieldId"
              component={DropdownField}
              options={getFieldOptions(values)}
            />
            <InputGroup
              label="Answer"
              name="value"
              component={DropdownField}
              options={getAnswerOptions(values)}
            />
          </DialogContent>
          <DialogFooter>
            <Button secondary onClick={() => onClose(null)}>
              Cancel
            </Button>
            <Button onClick={() => submitForm()}>Create</Button>
          </DialogFooter>
        </DialogBase>
      )}
    </Formik>
  );
};

type Settings = {
  name: string;
  basePrice: number;
  description: string;
  dueDate: string;
  componentMappings: Array<{
    name: string;
    price: number;
    rules: Array<{
      event: number;
      question: number;
      value: string;
    }>;
  }>;
};

const SettingsView = ({
  state,
  dispatch,
}: {
  state: State;
  dispatch: (action: Action) => void;
}) => {
  const starting = useMemo(() => subYears(new Date(), 1), []);
  const { data: allEvents } = useGetEventsQuery({ starting });
  const events = useMemo(
    () =>
      (allEvents ?? []).filter(event => state.eventIds.indexOf(event.id) > -1),
    [state.eventIds, allEvents],
  );
  const eventCustomFieldsArray = useFetchEventCustomFields(state.eventIds);
  const activeAccountingPeriod = useAppSelector(
    state => state.accountingPeriod.activePeriod,
  );
  const { data: accountingPeriods } = useGetAccountingPeriodsQuery();

  const [initialAccountingPeriod, setInitialAccountingPeriod] = useState<
    null | number
  >(null);

  useEffect(() => {
    if (initialAccountingPeriod === null && activeAccountingPeriod !== null) {
      setInitialAccountingPeriod(activeAccountingPeriod);
    }
  }, [activeAccountingPeriod]);

  const initialValues = useMemo(() => {
    if (!events?.length) {
      return {};
    }

    return {
      name: state.basicSettings.name ?? events[0].name,
      basePrice: state.basicSettings.basePrice.value
        ? state.basicSettings.basePrice.value / 100
        : events[0].price
          ? events[0].price.value / 100
          : 0,
      description:
        state.basicSettings.description ??
        `Osallistumismaksu tapahtumaan "${events[0].name}" // Fee for the event "${events[0].name}"`,
      dueDate:
        state.basicSettings.dueDate ??
        format(addDays(new Date(), 31), 'dd.MM.yyyy'),
      accountingPeriod: initialAccountingPeriod,
    };
  }, [initialAccountingPeriod, state, events]);

  const eventCustomFields = useMemo(() => {
    if (eventCustomFieldsArray === null) {
      return null;
    }

    return new Map(
      eventCustomFieldsArray.map((fields, i) => [state.eventIds[i], fields]),
    );
  }, [eventCustomFieldsArray, state.eventIds]);

  const showPricingRuleModal = useDialog(PricingRuleModal);

  if (!events?.length) {
    return null;
  }

  return (
    <div className="grid grid-cols-4 gap-x-5 gap-y-2">
      <Formik
        initialValues={initialValues}
        enableReinitialize
        validate={values => {
          const errors: Partial<Record<keyof Settings, string>> = {};

          if (values.dueDate) {
            if (!/^[0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4}$/.test(values.dueDate)) {
              errors.dueDate = 'Date must be in format <day>.<month>.<year>';
            } else if (!isMatch(values.dueDate, 'dd.MM.yyyy')) {
              errors.dueDate = 'Invalid date';
            }
          }

          return errors;
        }}
        onSubmit={values => {
          if (!values.basePrice || !values.accountingPeriod) {
            return;
          }

          const result = t.Int.decode(values.accountingPeriod);

          if (isLeft(result)) {
            return;
          }

          dispatch({
            type: 'SET_BASIC_SETTINGS',
            payload: {
              values: {
                name: values.name,
                basePrice: euro(values.basePrice),
                dueDate: values.dueDate,
                accountingPeriod: result.right,
              },
            },
          });
        }}
      >
        {({ submitForm }) => (
          <>
            <div className="col-span-full mt-4 border-b px-1 pb-2 text-xs font-bold uppercase text-gray-400">
              Common information
            </div>
            <InputGroup label="Name" name="name" component={TextField} />
            <InputGroup
              label="Base price"
              name="basePrice"
              component={EuroField}
            />
            <InputGroup label="Due Date" name="dueDate" component={DateField} />
            {(accountingPeriods?.length ?? 0) > 1 && (
              <InputGroup
                label="Accounting Period"
                name="accountingPeriod"
                component={DropdownField}
                options={(accountingPeriods ?? [])
                  .filter(period => !period.closed)
                  .map(period => ({
                    value: period.year,
                    text: `${period.year}`,
                  }))}
              />
            )}
            <InputGroup
              label="Description"
              name="description"
              fullWidth
              component={Textarea}
            />
            <div className="col-span-full mb-4 border-b px-1 pb-2 text-xs font-bold uppercase text-gray-400">
              Answer specific pricing
            </div>
            <div className="col-span-full">
              {state.components.map(
                ({ id: componentId, name, amount, rules }) => (
                  <div
                    className="component-mapping mb-3 mt-2 grid grid-cols-2 gap-x-2 rounded-md border bg-white px-3 shadow-sm"
                    key={componentId}
                  >
                    <StandaloneInputGroup
                      label="Name"
                      component={TextField}
                      value={name}
                      onChange={evt =>
                        dispatch({
                          type: 'UPDATE_COMPONENT',
                          payload: {
                            id: componentId,
                            values: {
                              name: evt.target.value,
                            },
                          },
                        })
                      }
                    />
                    <StandaloneInputGroup
                      label="Price"
                      component={EuroField}
                      value={amount.value / 100}
                      onChange={(evt: any) =>
                        dispatch({
                          type: 'UPDATE_COMPONENT',
                          payload: {
                            id: componentId,
                            values: {
                              amount: evt.target.value
                                ? euro(evt.target.value)
                                : euro(0),
                            },
                          },
                        })
                      }
                    />
                    <div className="col-span-full">
                      {rules.map(
                        ({
                          id: ruleId,
                          type,
                          eventId,
                          customFieldId,
                          value,
                        }) => {
                          if (type === 'CUSTOM_FIELD') {
                            return (
                              <div
                                className="flex items-center border-b px-3 py-2 last:border-0"
                                key={ruleId}
                              >
                                <Breadcrumbs
                                  segments={[
                                    '' +
                                      events.find(e => e.id === eventId)?.name,
                                    '' +
                                      eventCustomFields
                                        ?.get(eventId)
                                        ?.find(
                                          (f: CustomField) =>
                                            f.id === customFieldId,
                                        )?.name,
                                    '' + value,
                                  ]}
                                />
                                <div className="flex-grow" />
                                <button
                                  onClick={() =>
                                    dispatch({
                                      type: 'REMOVE_COMPONENT_RULE',
                                      payload: {
                                        componentId,
                                        ruleId,
                                      },
                                    })
                                  }
                                  className="text-gray-500"
                                >
                                  <X />
                                </button>
                              </div>
                            );
                          }
                        },
                      )}
                      <Button
                        onClick={async () => {
                          if (!eventCustomFields) {
                            return;
                          }

                          const rule = await showPricingRuleModal({
                            events,
                            fields: eventCustomFields,
                          });

                          if (rule === null) {
                            return;
                          }

                          dispatch({
                            type: 'ADD_COMPONENT_RULE',
                            payload: {
                              componentId,
                              rule: { ...rule, type: 'CUSTOM_FIELD' },
                            },
                          });
                        }}
                        disabled={eventCustomFields === null}
                        className="mb-3"
                      >
                        Add rule
                      </Button>
                      {/*<FieldArray name={`componentMappings.${i}.rules`}>
                      {(tools) => <>
                        {mapping.rules.length > 0 && (
                          <div className="border mb-3 rounded-md shadow-sm">
                            {mapping.rules.map((rule, i) => (
                            ))}
                          </div>
                        )}
                        <Button
                          onClick={() => promptRef.current?.prompt?.().then((values) => tools.push(values))}
                          className="mb-3"
                        >
                          Add rule
                        </Button>
                      </>}
                    </FieldArray>*/}
                    </div>
                  </div>
                ),
              )}
              <Button
                onClick={() =>
                  dispatch({
                    type: 'ADD_COMPONENT',
                    payload: { name: '', amount: euro(0) },
                  })
                }
              >
                Create component mapping
              </Button>
              <div className="flex justify-end gap-3">
                <Button
                  secondary
                  onClick={() => dispatch({ type: 'PREVIOUS_STEP' })}
                >
                  Back
                </Button>
                <Button onClick={submitForm}>Continue</Button>
              </div>
            </div>
          </>
        )}
      </Formik>
    </div>
  );
};

const evaluateRules = (
  state: State,
  event: Event,
  registration: Registration,
): Array<EvaluatedDebtComponent> => {
  const components = [
    { name: 'Base Price', id: -1, amount: state.basicSettings.basePrice },
  ];

  for (const { id, name, amount, rules } of state.components) {
    for (const rule of rules) {
      if (rule.type === 'CUSTOM_FIELD') {
        const { eventId, customFieldId, value: wanted } = rule;

        if (event.id !== eventId) continue;

        const answer = registration.answers.find(
          q => q.questionId === customFieldId,
        );

        if (!answer) continue;

        if (answer.answer === wanted) {
          components.push({
            id,
            name,
            amount,
          });
        }
      }
    }
  }

  return components;
};

type EvaluatedDebtComponent = Pick<DebtComponent, 'name' | 'amount'> & {
  id: number;
};
type EvaluatedRegistration = Registration & {
  components: Array<EvaluatedDebtComponent>;
  event: Event;
  queue: boolean;
};

type RegistrationTableProps = {
  registrations: Array<EvaluatedRegistration>;
  onSwap: (registrations: Array<EvaluatedRegistration>) => void;
  emptyMessage?: string | JSX.Element;
  actionLabel: string;
};

type CustomFieldAnswer = Registration['answers'][0];

const QuestionBadge = ({ question }: { question: CustomFieldAnswer }) => (
  <div className="flex">
    <span className="max-w-[7em] overflow-hidden text-ellipsis whitespace-nowrap rounded-l-[2pt] bg-gray-500 py-0.5 pl-1.5 pr-1 text-xs font-bold text-gray-200">
      {question.question}
    </span>
    <span className="whitespace-wrap rounded-r-[2pt] bg-gray-300 py-0.5 pl-1 pr-1.5 text-xs font-bold text-gray-600">
      {question.answer}
    </span>
  </div>
);

const ComponentBadge = ({
  component,
}: {
  component: EvaluatedDebtComponent;
}) => (
  <span className="mr-1 whitespace-nowrap rounded-[2pt] bg-gray-300 px-1.5 py-0.5 text-xs font-bold text-gray-600">
    {component.name} ({formatEuro(component.amount)})
  </span>
);

const RegistrationTable: React.FC<RegistrationTableProps> = ({
  registrations,
  onSwap,
  emptyMessage,
  actionLabel,
}) => {
  return (
    <Table
      selectable
      rows={registrations.map(r => ({ ...r, key: r.id }))}
      emptyMessage={emptyMessage}
      actions={[
        {
          key: 'swap',
          text: actionLabel,
          onSelect: r => onSwap(r),
        },
      ]}
      columns={[
        {
          name: 'Participant',
          getValue: (registration): string => registration.name,
          render: value => value,
        },
        {
          name: 'Event',
          getValue: registration => registration.event.name,
        },
        {
          name: 'Answers',
          getValue: r => r.answers.filter(answer => answer.answer !== ''),
          compareBy: value => `${value.question_id}:${value.answer}`,
          render: (value: CustomFieldAnswer[]) => (
            <div className="flex flex-col gap-0.5">
              {value.map(question => (
                <QuestionBadge key={question.questionId} question={question} />
              ))}
            </div>
          ),
        },
        {
          name: 'Components',
          getValue: r => r.components,
          compareBy: value => value.name,
          render: (value: EvaluatedDebtComponent[]) =>
            value.map(component => (
              <ComponentBadge key={component.name} component={component} />
            )),
        },
        {
          name: 'Total',
          getValue: r =>
            r.components.map(c => c.amount).reduce(sumEuroValues, euro(0)),
          compareBy: v => v.value,
          render: formatEuro,
        },
      ]}
    />
  );
};

type ParticipantsViewProps = {
  state: State;
  dispatch: React.Dispatch<Action>;
  queue: EvaluatedRegistration[];
  participants: EvaluatedRegistration[];
};

const ParticipantsView: React.FC<ParticipantsViewProps> = ({
  state,
  dispatch,
  queue,
  participants,
}) => {
  const swapRegistration =
    (selection: 'queue' | 'participant') =>
    (registrations: EvaluatedRegistration[]) => {
      registrations.forEach(({ id }) =>
        dispatch({
          type: 'SET_REGISTRATION_SELECTION',
          payload: {
            registrationId: id,
            selection,
          },
        }),
      );
    };

  console.log(state);

  return (
    <div className="pt-3">
      <div className="mb-5 mt-10 flex items-center">
        <div className="h-[1px] w-3 bg-gray-300" />
        <div className="mx-2 text-xs font-bold uppercase text-gray-500">
          Participants
        </div>
        <div className="h-[1px] flex-grow bg-gray-300" />
      </div>
      <p className="mb-7 mt-5 px-3">
        Below are listed the registrations for the users who fit into the
        event&apos;s participant quota. A debt will be created for each of these
        users. You can move participants from this list to the queue below if
        they should not be charged for the event.
      </p>
      <RegistrationTable
        registrations={participants}
        onSwap={swapRegistration('queue')}
        emptyMessage={
          <>
            None of the selected events include any registrations! <br /> <br />
            If you want to import registrations from an external source, such as
            Google Sheets, use the <strong>CSV import</strong> feature.
          </>
        }
        actionLabel="Move to queue"
      />
      <div className="mb-5 mt-10 flex items-center">
        <div className="h-[1px] w-3 bg-gray-300" />
        <div className="mx-2 text-xs font-bold uppercase text-gray-500">
          Queue
        </div>
        <div className="h-[1px] flex-grow bg-gray-300" />
      </div>
      <p className="mb-7 mt-5 px-3">
        Below is a list of users who have registered to the event but will not
        be charged. Initially this list contains users in the registration
        queue.
      </p>
      <RegistrationTable
        registrations={queue}
        onSwap={swapRegistration('participant')}
        emptyMessage={
          <>
            There is nobody in the queue! You can move people here from the
            above list by selecting rows and selecting the{' '}
            <strong>Move to queue</strong> action from the context menu.
          </>
        }
        actionLabel="Move to participants"
      />
      <div className="flex justify-end gap-3">
        <Button
          secondary
          className="mt-5 inline-block"
          onClick={() => dispatch({ type: 'PREVIOUS_STEP' })}
        >
          Back
        </Button>
        <Button
          className="mt-5 inline-block"
          onClick={() => dispatch({ type: 'GO_TO_CONFIRMATION' })}
        >
          Continue
        </Button>
      </div>
    </div>
  );
};

type ConfirmationViewProps = {
  participants: EvaluatedRegistration[];
  dispatch: React.Dispatch<Action>;
  state: State;
  onConfirm: () => void;
};

const ConfirmationView: React.FC<ConfirmationViewProps> = ({
  participants,
  state,
  dispatch,
  onConfirm,
}) => {
  const componentStats = participants
    .flatMap(p => p.components)
    .reduce(
      (acc, { id, name, amount }) => {
        const entry = acc.find(e => e.id === id);

        if (entry) {
          entry.amount = sumEuroValues(entry.amount, amount);
          entry.count += 1;
        } else {
          acc.push({
            id,
            name,
            count: 1,
            amount,
            price: amount,
          });
        }

        return acc;
      },
      [] as {
        id: number;
        name: string;
        count: number;
        amount: EuroValue;
        price: EuroValue;
      }[],
    );

  return (
    <div className="pt-3">
      <p className="mb-5">
        Creating {participants.length} debts named &quot;
        {state.basicSettings.name}&quot; with a total value of{' '}
        {formatEuro(
          participants
            .flatMap(p => p.components)
            .map(c => c.amount)
            .reduce(sumEuroValues, euro(0)),
        )}
        . The debts will be due at {state.basicSettings.dueDate}.
      </p>
      <Table
        rows={componentStats.map(r => ({ ...r, key: r.id }))}
        columns={[
          {
            name: 'Component',
            getValue: row => row.name,
          },
          {
            name: 'Price',
            getValue: row => row.price,
            render: formatEuro,
          },
          {
            name: 'Count',
            getValue: row => row.count,
          },
          {
            name: 'Total',
            getValue: row => row.amount,
            render: formatEuro,
          },
        ]}
      />
      <div className="mt-5 flex justify-end gap-3">
        <Button secondary onClick={() => dispatch({ type: 'PREVIOUS_STEP' })}>
          Back
        </Button>
        <Button onClick={() => onConfirm()}>Create Debts</Button>
      </div>
    </div>
  );
};

type State = {
  step: 'select-events' | 'settings' | 'registrations' | 'confirm';
  eventIds: number[];
  basicSettings: {
    name: string;
    dueDate: string;
    description: string;
    basePrice: EuroValue;
    accountingPeriod: null | t.Branded<number, t.IntBrand>;
  };
  components: {
    id: number;
    name: string;
    amount: EuroValue;
    rules: ComponentRule[];
  }[];
  registrationSelections: {
    registrationId: number;
    selection: 'participant' | 'queue';
  }[];
};

const INITIAL_STATE: State = {
  step: 'select-events',
  eventIds: [],
  basicSettings: {
    name: '',
    dueDate: format(addDays(new Date(), 31), 'dd.MM.yyyy'),
    description: '',
    basePrice: euro(0),
    accountingPeriod: null,
  },
  components: [],
  registrationSelections: [],
};

type SetRegistrationSelectionAction = {
  type: 'SET_REGISTRATION_SELECTION';
  payload: {
    registrationId: number;
    selection: 'queue' | 'participant';
  };
};

type SelectEventsAction = {
  type: 'SELECT_EVENTS';
  payload: {
    eventIds: number[];
  };
};

type BasicSettings = {
  name: string;
  dueDate: string;
  basePrice: EuroValue;
  accountingPeriod: t.Branded<number, t.IntBrand>;
};

type SetBasicSettingsAction = {
  type: 'SET_BASIC_SETTINGS';
  payload: {
    values: Partial<BasicSettings>;
  };
};

type AddComponentAction = {
  type: 'ADD_COMPONENT';
  payload: {
    name: string;
    amount: EuroValue;
  };
};

type RemoveComponentAction = {
  type: 'REMOVE_COMPONENT';
  payload: {
    id: number;
  };
};

type CustomFieldRule = {
  type: 'CUSTOM_FIELD';
  id: number;
  eventId: number;
  customFieldId: number;
  value: string;
};

type ComponentRule = CustomFieldRule;

type AddComponentRule = {
  type: 'ADD_COMPONENT_RULE';
  payload: {
    componentId: number;
    rule: Omit<ComponentRule, 'id'>;
  };
};

type RemoveComponentRule = {
  type: 'REMOVE_COMPONENT_RULE';
  payload: {
    componentId: number;
    ruleId: number;
  };
};

type PreviousStep = {
  type: 'PREVIOUS_STEP';
};

type UpdateComponent = {
  type: 'UPDATE_COMPONENT';
  payload: {
    id: number;
    values: Partial<{ name: string; amount: EuroValue }>;
  };
};

type GoToConfirmationAction = {
  type: 'GO_TO_CONFIRMATION';
};

type Action =
  | SelectEventsAction
  | SetBasicSettingsAction
  | AddComponentAction
  | RemoveComponentAction
  | AddComponentRule
  | RemoveComponentRule
  | PreviousStep
  | UpdateComponent
  | SetRegistrationSelectionAction
  | GoToConfirmationAction;

type ActionPayload<A> = A extends { payload: infer P } ? P : void;

type ActionMap = { [Key in Action['type']]: Extract<Action, { type: Key }> };
type ActionHandlers = {
  [Key in keyof ActionMap]: (payload: ActionPayload<ActionMap[Key]>) => void;
};

const createReducer = () => {
  let counter = 0;

  return produce((state: State, action: Action) => {
    console.log('ACTION', action);

    const handlers: ActionHandlers = {
      SELECT_EVENTS({ eventIds }) {
        state.eventIds = eventIds;
        state.step = 'settings';
      },

      SET_BASIC_SETTINGS({ values }) {
        Object.assign(state.basicSettings, values);
        state.step = 'registrations';
      },

      ADD_COMPONENT({ name, amount }) {
        state.components.push({
          name,
          id: counter++,
          amount,
          rules: [],
        });
      },

      UPDATE_COMPONENT({ id, values }) {
        const component = state.components.find(
          component => component.id === id,
        );

        if (component) {
          Object.assign(component, values);
        }
      },

      REMOVE_COMPONENT({ id }) {
        const index = state.components.findIndex(
          component => component.id === id,
        );
        state.components.splice(index, 1);
      },

      ADD_COMPONENT_RULE({ componentId, rule }) {
        const component = state.components.find(
          component => component.id === componentId,
        );

        if (component) {
          component.rules.push({
            ...rule,
            id: counter++,
          });
        }
      },

      REMOVE_COMPONENT_RULE({ componentId, ruleId }) {
        const component = state.components.find(
          component => component.id === componentId,
        );

        if (!component) {
          return;
        }

        const index = component.rules.findIndex(rule => rule.id === ruleId);

        if (index > -1) {
          component.rules.splice(index, 1);
        }
      },

      PREVIOUS_STEP() {
        const sequence: readonly State['step'][] = [
          'select-events',
          'settings',
          'registrations',
          'confirm',
        ] as const;
        state.step = sequence[Math.max(0, sequence.indexOf(state.step) - 1)];
      },

      SET_REGISTRATION_SELECTION({ registrationId, selection }) {
        const existing = state.registrationSelections.find(
          selection => selection.registrationId === registrationId,
        );

        if (existing) {
          existing.selection = selection;
        } else {
          state.registrationSelections.push({
            registrationId,
            selection,
          });
        }
      },

      GO_TO_CONFIRMATION() {
        state.step = 'confirm';
      },
    };

    handlers[action.type]((action as any).payload);
  });
};

//}[action.type](action.payload));

export const CreateDebtCenterFromEvent = () => {
  const reducer = useMemo(createReducer, []);
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  //const [wizardState, setWizardState] = useState<WizardState>('select-event');
  //const [events, setEvents] = useState(null);
  //const [settings, setSettings] = useState(null);
  const [createDebtCenterFromEvent] = useCreateDebtCenterFromEventMutation();
  const [, setLocation] = useLocation();

  const registrations = useFetchEventRegistrations(state.eventIds);
  const starting = useMemo(() => subYears(new Date(), 1), []);
  const { data: allEvents } = useGetEventsQuery({ starting });
  const events = useMemo(
    () =>
      state.eventIds.flatMap(
        id => (allEvents ?? []).find(e => e.id === id) ?? [],
      ),
    [state.eventIds, allEvents],
  );

  // console.log(state.eventIds, allEvents);

  // const wizardSteps: Array<WizardState> = ['select-event', 'settings', 'participants', 'confirmation'];

  const [participants, queue] = useMemo(() => {
    if (!registrations || events.length !== registrations.length) {
      return [[], []];
    }

    const evaluatedRegistrations = (registrations ?? []).flatMap(
      (eventRegistrations, eventIndex) => {
        const event = events[eventIndex];

        if (!event) {
          return [];
        }

        const registrations = eventRegistrations.map(registration => {
          const components = evaluateRules(state, event, registration);

          return {
            ...registration,
            event,
            components,
            key: registration.id,
            queue: false,
          } as EvaluatedRegistration;
        });

        const maxParticipants = event.maxParticipants ?? registrations.length;

        const participants = registrations
          .slice(0, maxParticipants)
          .map(r => ({ ...r, queue: false }));

        const queue = registrations
          .slice(maxParticipants)
          .map(r => ({ ...r, queue: true }));

        const all = [...participants, ...queue];

        return all.map(reg => {
          const override = state.registrationSelections.find(
            s => s.registrationId === reg.id,
          );
          const queue = override ? override.selection === 'queue' : reg.queue;

          return { ...reg, queue };
        });
      },
    );

    const participants = evaluatedRegistrations.filter(r => !r.queue);
    const queue = evaluatedRegistrations.filter(r => r.queue);

    return [participants, queue];
  }, [registrations, state]);

  const handleConfirm = () => {
    const accountingPeriod = state.basicSettings.accountingPeriod;

    if (accountingPeriod === null) {
      return;
    }

    const result = dateString.decode(state.basicSettings.dueDate);

    if (isLeft(result)) {
      return;
    }

    createDebtCenterFromEvent({
      events: events.map(e => e.id),
      registrations: participants.map(r => r.id),
      settings: {
        ...state.basicSettings,
        accountingPeriod: accountingPeriod as any,
        dueDate: result.right,
        components: state.components,
      },
    }).then(res => {
      if ('data' in res) {
        setLocation(`/admin/debt-centers/${res.data.id}`);
      }
    });
  };

  let content = null;

  if (state.step === 'select-events') {
    content = <EventSelectionView state={state} dispatch={dispatch} />;
  } else if (state.step === 'settings') {
    content = <SettingsView state={state} dispatch={dispatch} />;
  } else if (state.step === 'registrations') {
    content = (
      <ParticipantsView
        state={state}
        dispatch={dispatch}
        participants={participants}
        queue={queue}
      />
    );
  } else if (state.step === 'confirm') {
    content = (
      <ConfirmationView
        participants={participants}
        state={state}
        dispatch={dispatch}
        onConfirm={handleConfirm}
      />
    );
  }

  return (
    <>
      <h1 className="mb-5 mt-10 text-2xl">
        <Breadcrumbs
          linkComponent={Link}
          segments={[
            { text: 'Debt Centers', url: '/admin/debt-centers' },
            'Create from Event',
          ]}
        />
      </h1>
      <p className="mb-10">
        Create a new debt center and debts corresponding to a calendar event and
        it{"'"}s registrations.
      </p>
      <div className="mx-auto w-[30em]">
        <Stepper
          stages={['Select Events', 'Settings', 'Participants', 'Confirm']}
          currentStage={[
            'select-events',
            'settings',
            'registrations',
            'confirm',
          ].indexOf(state.step)}
        />
      </div>
      {content}
    </>
  );
};
