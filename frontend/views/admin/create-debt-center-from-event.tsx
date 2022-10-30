import { forwardRef, useEffect, useImperativeHandle, useCallback, useRef, useState, useMemo } from 'react'
import { Circle, Search, X } from 'react-feather';
import { Breadcrumbs } from '../../components/breadcrumbs'
import { Stepper } from '../../components/stepper'
import * as R from 'remeda'
import { Event } from '../../../common/types'
import { TextField } from '../../components/text-field'
import eventsApi, { useGetEventCustomFieldsQuery, useGetEventRegistrationsQuery, useGetEventsQuery } from '../../api/events'
import { addDays, format, isMatch, subYears } from 'date-fns';
import { FilledDisc } from '../../components/filled-disc'
import ReactModal from 'react-modal'
import { ListView } from '../../components/list-view';
import { TabularFieldList } from '../../components/tabular-field-list';
import { EuroField } from '../../components/euro-field';
import { InputGroup, StandaloneInputGroup } from '../../components/input-group';
import { TextareaField } from '../../components/textarea-field';
import { FieldArray, Formik } from 'formik';
import { DropdownField } from '../../components/dropdown-field';
import { Button, DisabledButton, SecondaryButton } from '../../components/button';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, useAppDispatch, useAppSelector } from '../../store';
import { createSelector } from '@reduxjs/toolkit';
import { QueryDefinition } from '@reduxjs/toolkit/dist/query/react';
import { ApiEndpointQuery } from '@reduxjs/toolkit/dist/query/core/module'
import { EndpointDefinition, QueryArgFrom, ResultTypeFrom } from '@reduxjs/toolkit/dist/query/endpointDefinitions';
import { useCreateDebtCenterFromEventMutation } from '../../api/debt-centers';
import { DateField } from '../../components/datetime-field';
import { useLocation } from 'wouter';

type WizardState = 'select-event' | 'confirmation' | 'settings'

type EventSelectionViewProps = {
  onSelect: (event: Event[]) => void
}

const EventSelectionView = ({ onSelect }: EventSelectionViewProps) => {
  const starting = useMemo(() => subYears(new Date(), 1), [])

  const { data: events } = useGetEventsQuery({
    starting,
  })

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState([])

  const handleSelect = (event) => setSelected(prev => {
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
      <div className="flex gap-5 items-center">
        <TextField
          value={search}
          onChange={(evt) => setSearch(evt.target.value)}
          placeholder="Search events"
          iconRight={<Search />}
          className="my-5 flex-grow"
        />
        {
          selected.length === 0
            ? <DisabledButton className="h-[40px] mt-1">Continue</DisabledButton>
            : <Button
              className="h-[40px] mt-1"
              onClick={() => onSelect(selected.map((id) => events.find(e => e.id === id)))}
            >Continue</Button>
        }
      </div>
      {
        (events ?? []).filter((e) => search === '' || e.name.toLowerCase().indexOf(search.toLowerCase()) > -1).map((event) => (
          <div
            className={`p-3 hover:border-blue-400 cursor-pointer rounded-md bg-white border shadow-sm mt-2 flex items-center ${selected.indexOf(event.id) > -1 && 'border-blue-400'}`}
            onClick={() => handleSelect(event)}
          >
            {
              selected.indexOf(event.id) === -1
                ? <Circle className="text-gray-400 mr-3" style={{ width: '1em', strokeWidth: '2.5px' }} />
                : <FilledDisc className="text-blue-500 mr-3" style={{ width: '1em', strokeWidth: '2.5px' }} />
            }
            <h3 className="">{event.name}</h3>
            <div className="flex-grow" />
            <span>{format(new Date(event.starts), 'dd.MM.yyyy')}</span>
          </div>
        ))
      }
    </>
  );
};

type EndpointDefinitionFrom<E> = E extends ApiEndpointQuery<infer D, any> ? D : never

function createMultiFetchHook<E extends ApiEndpointQuery<any, any>>(endpoint: E): (params: QueryArgFrom<EndpointDefinitionFrom<E>>[]) => ResultTypeFrom<EndpointDefinitionFrom<E>>[] | null {
  const selectMultipleCustomFieldQueries = createSelector(
    [
      (state: RootState) => state,
      (_state: RootState, params: QueryArgFrom<EndpointDefinitionFrom<E>>[]) => params,
    ],
    (state: RootState, params: QueryArgFrom<EndpointDefinitionFrom<E>>[]) => params.map((param) => endpoint.select(param)(state)),
  )

  return (params) => {
    const [results, setResults] = useState(null)

    const dispatch = useAppDispatch()

    useEffect(() => {
      params.forEach((param) => {
        const result = dispatch(endpoint.initiate(param));
        result.unsubscribe();
      });
    }, [params])

    const queries = useAppSelector((state) => selectMultipleCustomFieldQueries(state, params))

    useEffect(() => {
      if (queries.every(s => s.isSuccess)) {
        setResults(queries.map(query => query.data));
      }
    }, [queries])

    return results
  }
};

const useFetchEventCustomFields = createMultiFetchHook(eventsApi.endpoints.getEventCustomFields)
const useFetchEventRegistrations = createMultiFetchHook(eventsApi.endpoints.getEventRegistrations)

const Modal = ({ open, onClose, children }) => {
  return (
    <ReactModal
      isOpen={open}
      shouldCloseOnOverlayClick
      onRequestClose={onClose}
      style={{
        overlay: {
          backgroundColor: 'rgba(0,0,0,0.3)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        },
        content: {
          width: '40em',
          inset: 'initial',
          borderRadius: '0.375rem',
          borderColor: 'rgb(229, 231, 235)',
          boxShadow: 'rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.1) 0px 4px 6px -4px',
          overflow: 'initial'
        },
      }}
    >
      {children}
    </ReactModal>
  )
}

const PricingRuleModal = forwardRef(({ events, fields }, ref) => {
  const [open, setOpen] = useState(false)
  const promiseRef = useRef(null)

  useImperativeHandle(ref, () => ({
    prompt: () => {
      if (promiseRef.current) {
        return Promise.reject();
      }

      return new Promise((resolve, reject) => {
        promiseRef.current = [resolve, reject];
        setOpen(true)
      });
    },

    cancel: () => {
      setOpen(false);
      if (promiseRef.current) {
        promiseRef.current[1]();
        promiseRef.current = null;
      }
    }
  }))

  const handleClose = () => {
    setOpen(false)

    if (promiseRef.current) {
      promiseRef.current[1]();
      promiseRef.current = null;
    }
  }

  const handleSubmit = (values) => {
    if (promiseRef.current) {
      promiseRef.current[0](values);
      promiseRef.current = null;
    }

    setOpen(false)
  }

  return (
    <Modal open={open} onClose={handleClose}>
      <Formik
        initialValues={{
          event: null,
          question: null,
          answer: null,
        }}
        onSubmit={handleSubmit}
      >
        {({ values, submitForm }) => (
          <>
            <h1 className="text-2xl text-gray-800">Add pricing rule</h1>
            <div className="grid grid-cols-2 gap-x-8">
              <InputGroup
                label="Event"
                name="event"
                component={DropdownField}
                options={events.map((event) => ({
                  value: event.id,
                  text: event.name,
                }))}
              />
              <InputGroup
                label="Question"
                name="question"
                component={DropdownField}
                options={(fields.get(values.event) ?? []).map((field) => ({
                  value: field.id,
                  text: field.name,
                }))}
              />
              <InputGroup
                label="Answer"
                name="answer"
                component={DropdownField}
                options={((fields.get(values.event) ?? []).find(f => f.id === values.question)?.options ?? []).map((option) => ({
                  value: option,
                  text: option,
                }))}
              />
            </div>
            <div className="flex justify-end gap-4 mt-3">
              <SecondaryButton
                onClick={() => {
                  promiseRef.current?.[1]?.();
                  promiseRef.current = null;
                  setOpen(false);
                }}
              >
                Cancel
              </SecondaryButton>
              <Button onClick={() => submitForm()}>
                Create
              </Button>
            </div>
          </>
        )}
      </Formik>
    </Modal>
  );
});

type Settings = {
  name: string,
  basePrice: number,
  description: string,
  dueDate: string,
  componentMappings: Array<{
    name: string,
    price: number,
    rules: Array<{
      event: number,
      question: number,
      value: string,
    }>,
  }>,
}

const SettingsView = ({ events, onFinished }: { events: Event[], onFinished: (details: Settings) => void }) => {
  const eventIds = useMemo(() => events.map(e => e.id), [events])
  const eventCustomFieldsArray = useFetchEventCustomFields(eventIds)

  const eventCustomFields = useMemo(() => {
    if (eventCustomFieldsArray === null) {
      return null
    }

    const map = new Map()

    eventCustomFieldsArray
      .forEach((fields, i) => {
        map.set(eventIds[i], fields)
      })

    return map
  }, [eventCustomFieldsArray])

  const promptRef = useRef()

  return (
    <div className="grid gap-x-5 gap-y-2 grid-cols-2">
      {eventCustomFields && <PricingRuleModal ref={promptRef} events={events} fields={eventCustomFields} />}
      <Formik
        initialValues={{
          name: events[0].name,
          basePrice: events[0].price ? events[0].price.value / 100 : 0,
          description: `Osallistumismaksu tapahtumaan "${events[0].name}" // Fee for the event "${events[0].name}"`,
          dueDate: format(addDays(new Date(), 31), 'dd.MM.yyyy'),
          componentMappings: [],
        } as Settings}
        validate={(values) => {
          const errors = {} as any;

          if (!/^[0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4}$/.test(values.dueDate)) {
            errors.due_date = 'Date must be in format <day>.<month>.<year>'
          } else if (!isMatch(values.dueDate, 'dd.MM.yyyy')) {
            errors.due_date = 'Invalid date'
          }

          return errors;
        }}
        onSubmit={onFinished}
      >
        {({ values, submitForm }) => (
          <>
            <div className="col-span-full border-b mt-4 pb-2 uppercase text-xs font-bold text-gray-400 px-1">
              Common information
            </div>
            <InputGroup
              label="Name"
              name="name"
              component={TextField}
            />
            <InputGroup
              label="Base price"
              name="basePrice"
              component={EuroField}
            />
            <InputGroup
              label="Due Date"
              name="dueDate"
              component={DateField}
            />
            <InputGroup
              label="Description"
              name="description"
              fullWidth
              component={TextareaField}
            />
            <div className="col-span-full border-b mb-4 pb-2 uppercase text-xs font-bold text-gray-400 px-1">
              Answer specific pricing
            </div>
            <div className="col-span-full">
              <FieldArray
                name="componentMappings"
              >
                {(tools) => {
                  return (
                    <>
                      {values.componentMappings.map((mapping, i) => (
                        <div className="px-3 grid gap-x-2 grid-cols-2 mb-3 rounded-md bg-white border shadow-sm mt-2 flex">
                          <StandaloneInputGroup
                            label="Name"
                            component={TextField}
                            value={mapping.name}
                            onChange={(evt) => {
                              tools.replace(i, {
                                ...mapping,
                                name: evt.target.value,
                              })
                            }}
                          />
                          <StandaloneInputGroup
                            label="Price"
                            component={EuroField}
                            value={mapping.price}
                            onChange={(event) => {
                              tools.replace(i, {
                                ...mapping,
                                price: event.target.value,
                              })
                            }}
                          />
                          <div className="col-span-full">
                            <FieldArray name={`componentMappings.${i}.rules`}>
                              {(tools) => <>
                                {mapping.rules.length > 0 && (
                                  <div className="border mb-3 rounded-md shadow-sm">
                                    {mapping.rules.map((rule, i) => (
                                      <div className="flex items-center border-b last:border-0 py-2 px-3">
                                        <Breadcrumbs
                                          segments={[
                                            '' + events.find(e => e.id === rule.event)?.name,
                                            '' + eventCustomFields.get(rule.event).find(f => f.id === rule.question).name,
                                            '' + rule.answer,
                                          ]}
                                        />
                                        <div className="flex-grow" />
                                        <button onClick={() => tools.remove(i)} className="text-gray-500">
                                          <X />
                                        </button>
                                      </div>
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
                            </FieldArray>
                          </div>
                        </div>
                      ))}
                      <Button
                        onClick={() => tools.push({ name: '', price: 0, rules: [] })}
                      >Create component mapping</Button>
                    </>
                  );
                }}
              </FieldArray>
              <div className="flex justify-end">
                <Button onClick={submitForm}>Continue</Button>
              </div>
            </div>
          </>
        )}
      </Formik>
    </div>
  );
};

const ConfirmationView = ({ events, settings, onConfirm }) => {
  const eventIds = useMemo(() => events.map(e => e.id), [events])
  const registrations = useFetchEventRegistrations(eventIds)

  const total = useMemo(() => {
    if (!registrations) {
      return 0
    }

    return registrations.map(r => r.length).reduce((a, b) => a + b, 0);
  }, [registrations])

  return (
    <div>
      <p>
        Creating debt center for <b>{events.length === 1 ? '1 event' : `${events.length} events`}</b>{' '}
        with total of <b>{total} registrations</b>. Creating <b>{settings.componentMappings.length} debt components</b>{' '}
        based on registration details. <br /><br />
        All in all, up to <b>{(settings.componentMappings.map(m => m.price).reduce((a, b) => a + b, 0) + settings.basePrice) * total} euros</b> of debt can be created. Are you sure you want to continue? You can review the created debt instances afterwards.
      </p>
      <Button className="mt-7" onClick={() => onConfirm()}>Confirm</Button>
    </div>
  );
};

export const CreateDebtCenterFromEvent = () => {
  const [wizardState, setWizardState] = useState<WizardState>('select-event')
  const [events, setEvents] = useState(null)
  const [settings, setSettings] = useState(null)
  const [createDebtCenterFromEvent] = useCreateDebtCenterFromEventMutation()
  const [, setLocation] = useLocation()

  const handleConfirm = () => {
    createDebtCenterFromEvent({
      events: events.map(e => e.id),
      settings,
    }).then(res => {
      if ('data' in res) {
        setLocation(`/admin/debt-centers/${res.data.id}`)
      }
    })
  };

  let content = null

  if (wizardState === 'select-event') {
    content = <EventSelectionView onSelect={(evt) => { setEvents(evt); setWizardState('settings') }} />;
  } else if (wizardState === 'settings') {
    content = <SettingsView
      events={events}
      onFinished={(settings) => {
        setSettings(settings);
        setWizardState('confirmation');
      }}
    />;
  } else if (wizardState === 'confirmation') {
    content = <ConfirmationView
      events={events}
      settings={settings}
      onConfirm={handleConfirm}
    />;
  }

  return (
    <>
      <h1 className="text-2xl mt-10 mb-5">
        <Breadcrumbs
          segments={[
            { text: 'Debt Centers', url: '/admin/debt-centers' },
            'Create from Event'
          ]}
        />
      </h1>
      <p className="mb-10">
        Create a new debt center and debts corresponding to a calendar event and it's registrations.
      </p>
      <Stepper
        stages={['Select Events', 'Configure', 'Confirmation']}
        currentStage={['select-event', 'settings', 'confirmation'].indexOf(wizardState)}
      />
      {content}
    </>
  );
}
