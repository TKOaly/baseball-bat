import { useReducer, useState } from 'react'
import { CheckCircle, ChevronRight, Circle, Info } from 'react-feather'
import { useLocation } from 'wouter'
import { Trans, useTranslation } from 'react-i18next'
import { euro, EuroValue, Session } from '../../common/types'
import { LargeContainer } from '../components/containers'
import { Stepper } from '../components/stepper'
import { TextField } from '../components/text-field'
import { EventList } from '../components/event-list'
import { Dialog } from '../components/dialog'
import { Loading } from '../components/loading'
import { PaymentTab } from '../components/payment-tab'
import { useEvents } from '../hooks'
import paymentPoolSlice from '../state/payment-pool'
import { useGetPayerDebtsQuery, useGetPayerEmailsQuery, useGetPayerQuery, useUpdatePayerPreferencesMutation } from '../api/payers'
import { cents, formatEuro, sumEuroValues } from '../../common/currency'
import { format, isPast } from 'date-fns'
import { Button, SecondaryButton } from '../components/button'
import { useGetUpstreamUserQuery } from '../api/upstream-users'
import { useAppDispatch, useAppSelector } from '../store'
import { useGetOwnPaymentsQuery } from '../api/payments'

const FilledDisc = ({ color = 'currentColor', size = 24, ...rest }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...rest}
  >
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="3" fill="currentColor" />
  </svg>
)

type Props = {
  session: Session
}

const WelcomeDialog = () => {
  const [stage, setStage] = useState(0)
  const [membership, setMembership] = useState(null)
  const [name, setName] = useState('')
  const { data: user, isError: isUserError, isLoading: isUserLoading } = useGetUpstreamUserQuery('me')
  const { data: profile, isError: isPayerError, isLoading: isPayerLoading } = useGetPayerQuery('me')
  const { data: emails } = useGetPayerEmailsQuery(profile?.id?.value, { skip: !profile })
  const hasConfirmedMembership = useAppSelector((state) => state.session.preferences?.hasConfirmedMembership)
  const token = useAppSelector((state) => state.session.token)
  const [updatePreferences] = useUpdatePayerPreferencesMutation()

  const open = !isUserLoading && !(user || hasConfirmedMembership);

  const handleMembershipConfirmation = (isMember: boolean) => {
    if (!isMember) {
      updatePreferences({
        payerId: profile?.id?.value,
        preferences: {
          hasConfirmedMembership: true,
        },
      })

      return;
    }

    window.location.replace(`${process.env.BACKEND_URL}/api/session/login?target=welcome&token=${encodeURIComponent(token)}`)
  }

  return (
    <Dialog open={open} noClose>
      {/*<div className="w-[25em] mx-auto my-5">
        <Stepper
          stages={['Welcome', 'Membership', 'Authentication', 'Name']}
          currentStage={stage}
          loading={false}
        />
      </div>*/}

      <h1 className="text-center mb-4 text-2xl text-gray-800">Welcome!</h1>

      <div className="w-80 mx-auto text-center">
        {stage === 0 && (
          <>
            <p className="mb-2">
              It seems that this is your first time using this service.
              Let's get started by confirming a few basic things...
            </p>

            <p className="mb-5">
              You profile is not associated with a TKO-äly member account.
              If you are a member of the organization, you can authenticate with the button below.
              Otherwise you can skip this stage.
            </p>

            <div className="flex flex-col gap-2 mb-5">
              <Button onClick={() => handleMembershipConfirmation(true)}>I am a member of TKO-äly ry</Button>
              <SecondaryButton onClick={() => handleMembershipConfirmation(false)}>I am not a member</SecondaryButton>
            </div>
          </>
        )}

        {stage === 1 && (
          <>
            <p className="mb-5">
              Is your name <b>{profile?.name}</b> and is your preferred e-mail address <b>{emails.find(e => e.priority === 'primary')?.email}</b>?
            </p>

            <div className="flex flex-col gap-3 mb-5">
              <Button onClick={() => { setMembership(true); setStage(3); }}>Yes</Button>
              <SecondaryButton onClick={() => { }}>No</SecondaryButton>
            </div>
          </>
        )}

        {stage === 1 && !isUserLoading && isUserError && !isPayerLoading && !isPayerError && !profile?.tkoalyUserId && (
          <>
            <b className="block text-center my-4">Are you a member of TKO-äly ry?</b>

            <div className="flex flex-col gap-3 items-center">
              <Button onClick={() => { setMembership(true); setStage(2); }}>Yes, I am a member.</Button>
              <SecondaryButton onClick={() => { setMembership(false); setStage(3); }}>No, I am not a member.</SecondaryButton>
            </div>
          </>
        )}

        {stage === 2 && (
          <>
            <p>
              Please login with you TKO-äly member account.
            </p>

            <Button
              className="bg-yellow-300 hover:bg-yellow-400 w-full text-black shadow w-60 mt-4"
              onClick={() => window.location.replace(`${process.env.BACKEND_URL}/api/session/login`)}
            >
              Login
            </Button>
          </>
        )}

        {stage === 3 && (
          <>
            <b className="block text-center my-4">What is your name?</b>

            <TextField className="w-60" />

            <Button onClick={() => { }}>Complete</Button>
          </>
        )}
      </div>
    </Dialog>
  )
}

export const Main = (props: Props) => {
  const [, setLocation] = useLocation()
  const { t } = useTranslation()
  const { data: debts } = useGetPayerDebtsQuery({ id: 'me' })
  const { data: payments } = useGetOwnPaymentsQuery()
  const { data: profile } = useGetPayerQuery('me')
  const dispatch = useAppDispatch()
  const selectedDebts = useAppSelector((state) => state.paymentPool.selectedPayments)

  const toggleDebtSelection = (debt) => {
    dispatch(paymentPoolSlice.actions.togglePaymentSelection(debt.id))
  }

  const handlePayAll = async () => {
    dispatch(paymentPoolSlice.actions.setSelectedPayments(unpaidDepts.map(p => p.id)))
    setLocation('/payment/new')
  }

  const unpaidDepts = (debts ?? []).filter(p => p.status === 'unpaid' && !p.credited);
  const paidDepts = (debts ?? []).filter(p => p.status === 'paid' || p.credited);

  const totalEuros = unpaidDepts
    .flatMap(debt => debt.debtComponents.map(dc => dc.amount))
    .reduce(sumEuroValues, euro(0));

  return (
    <>
      <h3 className="text-xl text-gray-500 font-bold">
        {t('welcomeHeader', { name: profile?.name })}
      </h3>
      <p className="mt-3">
        {unpaidDepts.length > 0 && (
          <Trans i18nKey="welcomeSummary">
            You have <span className="font-bold">{{ number: unpaidDepts.length }}</span> unpaid debts, which have a combined value of <span className="font-bold">{{ total: formatEuro(totalEuros) }}</span>.
          </Trans>
        )}
        {unpaidDepts.length === 0 && (
          t('welcomeSummaryNoDebts')
        )}
      </p>

      {unpaidDepts.length > 0 && (
        <Button onClick={handlePayAll} className="mt-3">{t('payAllButton')}</Button>
      )}

      <WelcomeDialog />

      <h3 className="border-b-2 text-xl font-bold pb-1 mt-5 text-gray-600">
        {t('unpaidDebts')}
      </h3>

      {unpaidDepts.map((p) => (
        <div className="rounded-md border group border-gray-300 hover:border-blue-400 mt-5 p-4 shadow-sm cursor-pointer" onClick={() => toggleDebtSelection(p)}>
          <div className="flex items-center">
            {
              selectedDebts.indexOf(p.id) >= 0
                ? <FilledDisc className="text-blue-500 group-hover:text-blue-500 mr-3" style={{ width: '1em', strokeWidth: '2.5px' }} />
                : <Circle className="text-gray-500 group-hover:text-blue-500 mr-3" style={{ width: '1em', strokeWidth: '2.5px' }} />
            }
            <div>
              <h4 className="mb-0">{p?.name}</h4>
              <div className="text-gray-400 mr-2 text-sm -mt-1">
                {t('debtListInfoline', { created: format(new Date(p.createdAt), 'dd.MM.yyyy'), dueDate: format(new Date(p?.dueDate), 'dd.MM.yyyy') })}
              </div>
            </div>
            <div className="flex-grow" />
            {
              p.dueDate && isPast(new Date(p.dueDate)) && (
                <div className="py-0.5 px-1 text-xs rounded-sm bg-red-500 mx-2 font-bold text-white">Myöhässä</div>
              )
            }
            <span className="font-bold text-gray-600">{formatEuro(p.debtComponents.map(c => c.amount).reduce(sumEuroValues))}</span>
            <ChevronRight className="h-8 w-8 text-gray-400 ml-3 hover:bg-gray-200 rounded-full" onClick={() => setLocation(`/debt/${p.id}`)} />
          </div>
        </div>
      ))}

      {unpaidDepts.length === 0 && (
        <div className="py-3 flex items-center text-gray-600 gap-3 px-3 bg-gray-100 border shadow border-gray-300 rounded-md mt-3">
          <Info />
          {t('noUnpaidDebts')}
        </div>
      )}

      <h3 className="border-b-2 text-xl font-bold pb-1 mt-5 text-gray-600">
        {t('openPayments')}
      </h3>

      {(payments ?? []).filter(p => !p.credited).map((p) => (
        <div className="rounded-md border group border-gray-300 hover:border-blue-400 mt-5 p-4 shadow-sm cursor-pointer">
          <div className="flex items-center">
            <Circle className="text-gray-500 group-hover:text-blue-500 mr-3" style={{ width: '1em', strokeWidth: '2.5px' }} />
            <div>
              <h4 className="mb-0">{p.title} <span className="text-gray-500">({p.payment_number})</span></h4>
              <div className="text-gray-400 mr-2 text-sm -mt-1">
                {t('paymentListInfoline', { created: format(new Date(p.created_at), 'dd.MM.yyyy') })}
              </div>
            </div>
            <div className="flex-grow" />
            <span className="font-bold text-gray-600">{formatEuro(cents(p.balance))}</span>
            <ChevronRight className="h-8 w-8 text-gray-400 ml-3 hover:bg-gray-200 rounded-full" onClick={() => setLocation(`/payment/${p.id}`)} />
          </div>
        </div>
      ))}

      {(payments ?? []).filter(p => !p.credited).length === 0 && (
        <div className="py-3 flex items-center text-gray-600 gap-3 px-3 bg-gray-100 border shadow border-gray-300 rounded-md mt-3">
          <Info />
          {t('noOpenPayments')}
        </div>
      )}

      <h3 className="border-b-2 text-xl font-bold pb-1 mt-5 text-gray-600">
        {t('paidDebts')}
      </h3>

      {paidDepts.map((p) => (
        <div className="rounded-md border border-blue-400 mt-5 p-4 shadow-sm">
          <div className="flex items-center">
            <CheckCircle className="text-blue-500 mr-3" style={{ width: '1em', strokeWidth: '2.5px' }} />
            <h4>{p?.name}</h4>
            <div className="flex-grow" />
            <span className="font-bold text-gray-600">{formatEuro(p.debtComponents.map(c => c.amount).reduce(sumEuroValues))}</span>
          </div>
        </div>
      ))}

      {paidDepts.length === 0 && (
        <div className="py-3 flex items-center text-gray-600 gap-3 px-3 bg-gray-50 border shadow border-gray-300 rounded-md mt-3">
          <Info />
          {t('noPaidDebts')}
        </div>
      )}
    </>
  )
}
