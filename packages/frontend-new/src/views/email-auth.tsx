import { TextField } from '@bbat/ui/text-field';
import { Button } from '@bbat/ui/button';
import { Stepper } from '../components/stepper';
import { InputGroup } from '../components/input-group';
import { Formik, FormikHelpers } from 'formik';
import { useLocation } from 'wouter';
import { Dispatch, JSXElementConstructor, useEffect, useReducer, useState } from 'react';
import {
  usePollAuthStatusQuery,
  useRequestAuthCodeMutation,
  useValidateAuthCodeMutation,
} from '../api/auth';
import { useAppDispatch } from '../store';
import { authenticateSession } from '../session';
import { skipToken } from '@reduxjs/toolkit/query';

const SendStep = ({ onCompletion, setLoading, dispatch }: StepComponentProps) => {
  const [sendAuthCodeMutation] = useRequestAuthCodeMutation();

  type Values = { email: string }

  const sendAuthCode = async ({ email }: Values, { setErrors }: FormikHelpers<Values>) => {
    setLoading(true);
    const res = await sendAuthCodeMutation(email);

    if ('error' in res) {
      setErrors({
        email: 'No user with such email in the system.',
      });
    } else {
      dispatch({
        type: 'SET_AUTH_ID',
        payload: {
          id: res.data.id,
        },
      });

      onCompletion();
    }
  };

  return (
    <Formik initialValues={{ email: '' }} onSubmit={sendAuthCode}>
      {({ submitForm }) => (
        <div className="w-80 mx-auto py-5">
          <InputGroup label="Email" name="email" component={TextField} placeholder="Email" />
          <div className="mt-3 text-right">
            <Button onClick={() => submitForm()}>Send Confirmation</Button>
          </div>
        </div>
      )}
    </Formik>
  );
};

const ConfirmStep = ({ state, onCompletion }: StepComponentProps) => {
  const [validateAuthCode] = useValidateAuthCodeMutation();
  const [pollingInterval, setPollingInterval] = useState(1);

  const authStatus = usePollAuthStatusQuery(
    state.id ? { id: state.id } : skipToken,
    { pollingInterval },
  );

  useEffect(() => {
    if (authStatus.data?.authenticated) {
      setPollingInterval(0);
      onCompletion();
    }
  }, [authStatus]);

  return (
    <Formik
      initialValues={{ code: '' }}
      validate={({ code }) => {
        const errors: { code?: string } = {};

        if (code.length !== 8) {
          errors.code = 'Code should be 8 characters in length';
        }

        return errors;
      }}
      onSubmit={async ({ code }, ctx) => {
        if (!state.id) {
          return;
        }

        const res = await validateAuthCode({ id: state.id, code });

        if ('data' in res && res.data.success) {
          onCompletion();
        } else {
          ctx.setErrors({
            code: 'Invalid Code',
          });
        }
      }}
    >
      {({ submitForm, setFieldValue }) => (
        <div className="w-80 mx-auto py-5">
          <InputGroup
            name="code"
            label="Confirmation Code"
            component={TextField}
            placeholder="Confirmation Code"
            onChange={evt => {
              setFieldValue(
                'code',
                evt.target.value.toUpperCase().replace(/[^A-Z0-9]/, ''),
              );
            }}
          />
          <div className="mt-3 text-right">
            <Button onClick={() => submitForm()}>Confirmation</Button>
          </div>
        </div>
      )}
    </Formik>
  );
};

const SuccessStep = ({ state }: StepComponentProps) => {
  const dispatch = useAppDispatch();
  const [, setLocation] = useLocation();

  const onContinue = () => {
    if (state.id) {
      dispatch(authenticateSession(state.id)).then(() => setLocation('/'));
    }
  };

  return (
    <>
      <Button onClick={onContinue}>Continue</Button>
    </>
  );
};

type State = {
  id: string | null;
};

type Event = { type: 'SET_AUTH_ID'; payload: { id: string } };

const reducer = (state: State, { type, payload }: Event): State => {
  if (type === 'SET_AUTH_ID') {
    return {
      ...state,
      id: payload.id,
    };
  }

  return state;
};

const initialState: State = {
  id: null,
};

export const EmailAuth = () => {
  const [stage, setStage] = useState(0);
  const [loading, setLoading] = useState(false);

  const [state, dispatch] = useReducer(reducer, initialState);

  const StepComponent: JSXElementConstructor<StepComponentProps> = [SendStep, ConfirmStep, SuccessStep][stage];

  return (
    <>
      <h3 className="text-xl text-gray-500 font-bold">Email Authentication</h3>

      <p className="my-5">
        If you do not have a TKO-äly member account, you can authenticate with a
        one-time code sent to your email. This is only possible if your account
        does not have any other authentication mechanism enabled.
      </p>

      <div className="-mx-5 border-b mb-5"></div>

      <div className="mx-5">
        <Stepper
          stages={['Send', 'Confirm', 'Success']}
          currentStage={stage}
          loading={loading}
        />
      </div>

      <StepComponent
        onCompletion={() => {
          setStage(stage + 1);
          setLoading(false);
        }}
        setLoading={loading => setLoading(loading)}
        state={state}
        dispatch={dispatch}
      />
    </>
  );
};

type StepComponentProps = {
  onCompletion: () => void,
  setLoading: (loading: boolean) => void,
  state: State,
  dispatch: Dispatch<Event>,
}
