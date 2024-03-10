import { Route, RouteComponentProps, Switch, useLocation } from 'wouter';
import {
  ComponentProps,
  FormEventHandler,
  KeyboardEventHandler,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { cva } from 'class-variance-authority';
import {
  useRequestAuthCodeMutation,
  useValidateAuthCodeMutation,
} from '../api/auth';
import { Loader } from 'react-feather';
import { useAppDispatch } from '../store';
import { authenticateSession } from '../session';
import { BACKEND_URL } from '../config';

const SpinnerButton: React.FC<
  ComponentProps<'button'> & { loading?: boolean }
> = ({ children, loading, ...props }) => (
  <button
    className={`group relative mt-5 h-10 w-full gap-2 overflow-hidden rounded-md bg-yellow-400 px-3 text-center font-bold text-black shadow-sm ${loading ? 'loading' : ''}`}
    {...props}
  >
    <span className="absolute inset-x-0 top-0 flex h-10 items-center justify-center duration-200 group-[.loading]:-top-12">
      {children}
    </span>
    <span className="absolute inset-0 flex items-center justify-center">
      <Loader className="relative -bottom-10 animate-[spin_3s_linear_infinite] duration-200 group-[.loading]:bottom-0" />
    </span>
  </button>
);

const InitialStep = () => {
  const { t } = useTranslation([], { keyPrefix: 'landing' });
  const [, navigate] = useLocation();
  const [sendAuthCodeMutation, { isLoading }] = useRequestAuthCodeMutation();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();

  const handleSubmit: FormEventHandler = async evt => {
    evt.preventDefault();

    setError(undefined);
    const result = await sendAuthCodeMutation(email);

    if ('data' in result) {
      navigate(`/verify/${result.data.id}`);
    } else {
      setError(t('noSuchEmailError'));
    }
  };

  return (
    <form onSubmit={handleSubmit} method="">
      <p className="mb-6 text-sm">{t('authDescription')}</p>
      <input
        type="email"
        value={email}
        onChange={evt => setEmail(evt.currentTarget.value)}
        placeholder={t('authEmailPlaceholder')}
        className={`h-10 w-full ${error ? 'border-red-600' : 'border-gray-200'} rounded-md border px-3 shadow-sm`}
      />
      {error && <span className="text-sm text-red-600">{error}</span>}
      <SpinnerButton loading={isLoading} type="submit">
        {t('authContinue')}
      </SpinnerButton>
      <div className="my-3 text-center text-zinc-400">
        &mdash; {t('authOr')} &mdash;
      </div>
      <a
        href={`${BACKEND_URL}/api/session/login`}
        className="shdow-sm inline-flex h-10 w-full items-center justify-center rounded-md bg-zinc-200 px-3 text-zinc-800"
      >
        {t('authTKOalyButton')}
      </a>
    </form>
  );
};

const VerificationStep = ({ params }: RouteComponentProps<{ id: string }>) => {
  const { t } = useTranslation([], { keyPrefix: 'landing' });
  const [, navigate] = useLocation();
  const [validateAuthCode, { isLoading }] = useValidateAuthCodeMutation();
  const [error, setError] = useState<string>();
  const dispatch = useAppDispatch();

  const inputRefs = useRef<HTMLInputElement[]>([]);

  const setRef = (i: number) => (el: HTMLInputElement | null) => {
    if (el) {
      if (i === 0) {
        el.focus();
      }
      inputRefs.current[i] = el;
    } else {
      delete inputRefs.current[i];
    }
  };

  const submit = async () => {
    const code = inputRefs.current.map(el => el.value).join('');

    const result = await validateAuthCode({
      id: params.id,
      code,
    });

    if ('data' in result && result.data.success) {
      dispatch(authenticateSession(params.id)).then(() => navigate('~/'));
    } else {
      setError(t('invalidCodeError'));
    }
  };

  const handleCodeInput: KeyboardEventHandler<HTMLInputElement> = async evt => {
    const el = evt.currentTarget;
    const i = inputRefs.current.indexOf(el);

    const input = evt.currentTarget.value;

    let ch = 0;

    for (; ch < input.length && ch < inputRefs.current.length - i; ch++) {
      inputRefs.current[i + ch].value = input[ch].toUpperCase();
    }

    const code = inputRefs.current.map(el => el.value).join('');

    if (code.length === 8 && i + ch === 8) {
      await submit();
    } else {
      inputRefs.current[ch + i].focus();
      inputRefs.current[ch + i].select();
    }
  };

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = evt => {
    const i = inputRefs.current.indexOf(evt.currentTarget);
    let next;

    switch (evt.key) {
      case 'ArrowLeft':
        next = i - 1;
        break;

      case 'ArrowRight':
        next = i + 1;
        break;

      default:
        return;
    }

    inputRefs.current.at(next % inputRefs.current.length)?.focus();
    inputRefs.current.at(next % inputRefs.current.length)?.select();
    evt.preventDefault();
  };

  const createInput = (i: number) => (
    <input
      onInput={handleCodeInput}
      onFocus={evt => evt.currentTarget.select()}
      onKeyDown={handleKeyDown}
      data-testid={`auth-code-${i}`}
      ref={setRef(i)}
      type="text"
      className={`h-10 min-w-0 border-y border-r first:rounded-l-md first:border-l last:rounded-r-md focus:z-20 ${error ? 'border-red-400 text-red-600' : 'border-gray-200'} text-center`}
      key={i}
    />
  );

  return (
    <>
      <p className="mb-8 text-sm">{t('authSentMessage')}</p>
      <div className="mb-4 flex items-start justify-center">
        <div className="inline-block">
          <div className="relative z-10 inline-flex w-[8em] justify-stretch rounded-md shadow-sm">
            {new Array(4).fill(true).map((_, i) => createInput(i))}
          </div>
          {error && (
            <div className="h-0 w-0 whitespace-nowrap text-sm text-red-500">
              {error}
            </div>
          )}
        </div>
        <span className="mx-2 flex h-10 items-center font-bold text-gray-500">
          &ndash;
        </span>
        <div className="inline-flex w-[8em] justify-stretch rounded-md shadow-sm">
          {new Array(4).fill(true).map((_, i) => createInput(i + 4))}
        </div>
      </div>
      <SpinnerButton onClick={submit} loading={isLoading} type="submit">
        {t('authContinue')}
      </SpinnerButton>
      <input
        type="button"
        value="Back"
        onClick={() => navigate('/')}
        className="mt-5 h-10 w-full rounded-md bg-gray-100 px-3 text-center"
      />
    </>
  );
};

const languageSelectorCva = cva('py-1 px-2 rounded-md border cursor-pointer', {
  variants: {
    active: {
      true: 'border-zinc-400 ',
      false: 'border-transparent',
    },
  },
});

export const Landing = () => {
  const { t, i18n } = useTranslation([], { keyPrefix: 'landing' });

  return (
    <div
      className="flex min-h-screen justify-evenly px-4 backdrop-blur-md"
      id="landing"
    >
      <div className="hidden items-center justify-center lg:flex">
        <div className="max-w-[50ch] text-zinc-100">
          <h1 className="font-dm-serif text-4xl font-extrabold text-zinc-100 drop-shadow-xl">
            {t('heroTitle')}
          </h1>
          <p className="mt-5">{t('heroParagraph1')}</p>
          <p className="mt-5">{t('heroParagraph2')}</p>
          <a
            href="https://tko-aly.fi/"
            className="mr-5 mt-8 inline-flex h-10 items-center rounded-md bg-gray-200/10 px-5 shadow-sm"
          >
            {t('heroButton')}
          </a>
        </div>
      </div>
      <div className="flex grow flex-col items-center justify-center lg:grow-0">
        <h1 className="font-dm-serif mb-10 text-4xl font-extrabold text-zinc-100 drop-shadow-xl lg:hidden">
          {t('heroTitle')}
        </h1>
        <div>
          <div className="mx-auto max-w-96 rounded-lg bg-white p-8 shadow-lg lg:mt-10">
            <div className="flex justify-between">
              <h1 className="mb-3 font-bold text-gray-900">
                {t('authHeader')}
              </h1>
            </div>
            <Switch>
              <Route path="/verify/:id" component={VerificationStep} />
              <Route>
                <InitialStep />
              </Route>
            </Switch>
          </div>
          <div className="mt-6 space-x-3 text-center text-sm text-zinc-400">
            <button
              className={languageSelectorCva({
                active: i18n.language === 'fi',
              })}
              onClick={() => i18n.changeLanguage('fi')}
            >
              Suomeksi
            </button>
            <button
              className={languageSelectorCva({
                active: i18n.language === 'en',
              })}
              onClick={() => i18n.changeLanguage('en')}
            >
              In English
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
