import React from 'react'
import { useTranslation } from 'react-i18next'
import { useGetPaymentQuery } from '../api/payments'
import { Circle } from 'react-feather'
import { useGetDebtsByPaymentQuery } from '../api/debt'
import { formatEuro, euro, sumEuroValues, cents } from '../../common/currency'
import { Payment } from '../../common/types'
import { differenceInDays, formatRelative } from 'date-fns'

const formatDate = (date: Date | string) => {
  const parsed = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat([], { dateStyle: 'medium' }).format(parsed)
}

const formatDateRelative = (date: Date | string) => {
  const parsed = typeof date === 'string' ? new Date(date) : date;

  return new Intl.RelativeTimeFormat([], { style: 'long' }).format(differenceInDays(parsed, new Date()), "day")
}

type InvoiceData = {
  reference_number: string
  due_date: string
}

type TimelineEvent = {
  time: Date,
  title: string,
  body?: string,
}

type TimelineProps = {
  events: Array<TimelineEvent>,
}

const Timeline = ({ events }: TimelineProps) => {
  return (
    <ul className="px-3">
      {events.map((event, i) => (
        <li className="flex items-start">
          <div className="flex flex-col self-stretch items-center mr-3">
            <div className={`h-8 ${i > 0 ? 'w-0.5 bg-gray-300' : ''}`}></div>
            <Circle className="text-blue-500 group-hover:text-blue-500" style={{ width: '1em', strokeWidth: '4px' }} />
            {i < events.length - 1 && (
              <div className="w-0.5 flex-grow bg-gray-300"></div>
            )}
          </div>
          <div>
            <span className="text-xs capitalize text-gray-600 pl-2">{formatRelative(event.time, Date.now())}</span>
            <div className="rounded-md border border-gray-300 bg-gray-50 py-2 px-3 shadow-sm text-sm mb-3">
              <h4 className="font-bold text-gray-700">{event.title}</h4>
              <p>{event.body}</p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

const InvoiceDetails = ({ payment }: { payment: Payment }) => {
  const data = payment.data as InvoiceData
  const { t } = useTranslation([], { keyPrefix: 'paymentDetails' })

  return (
    <div className="p-3">
      <table>
        <tr>
          <th className="text-right pr-3">{t('invoiceTitleHeader')}</th>
          <td>{payment.title}</td>
        </tr>
        <tr>
          <th className="text-right pr-3">{t('invoiceNumberHeader')}</th>
          <td>{payment.payment_number}</td>
        </tr>
        <tr>
          <th className="text-right pr-3">{t('invoiceCreatedAtHeader')}</th>
          <td>{formatDate(payment.created_at)}</td>
        </tr>
        <tr>
          <th className="text-right pr-3">{t('invoiceDueDateHeader')}</th>
          <td>{data.due_date && formatDate(new Date(data.due_date))} ({data.due_date && formatDateRelative(data.due_date)})</td>
        </tr>
        <tr>
          <th className="text-right pr-3">{t('invoiceAmountHeader')}</th>
          <td>{formatEuro(cents(-payment.balance))}</td>
        </tr>
        <tr>
          <th className="text-right pr-3 h-4">{t('invoiceReferenceNumberHeader')}</th>
          <td>{data.reference_number}</td>
        </tr>
        <tr>
          <th className="text-right pr-3">{t('invoiceBeneficaryNameHeader')}</th>
          <td>TKO-äly ry</td>
        </tr>
        <tr>
          <th className="text-right pr-3">{t('invoiceBeneficaryAccountHeader')}</th>
          <td>FI89 7997 7995 1312 86</td>
        </tr>
        <tr>
          <th className="text-right pr-3">{t('invoiceBICHeader')}</th>
          <td>HOLVFIHH</td>
        </tr>
      </table>
    </div>
  )
}

export const PaymentDetails = ({ params }) => {
  const id = params.id
  const { t } = useTranslation()
  const { data: payment, isLoading } = useGetPaymentQuery(id)
  const { data: debts, isLoading: debtsAreLoading } = useGetDebtsByPaymentQuery(id, { skip: !payment })

  if (isLoading) {
    return <span>Loading...</span>
  }

  return (
    <>
      <h3 className="text-xl text-gray-500 font-bold">Payment: {payment.title} ({payment.payment_number})</h3>

      <div className="my-3">
        <table>
          <tr>
            <th className="text-left pr-3">{t('createdAt')}</th>
            <td>{formatDate(payment.created_at)}</td>
          </tr>
          <tr>
            <th className="text-left pr-3">{t('toBePaid')}</th>
            <td>{formatEuro(cents(-payment.balance))}</td>
          </tr>
          <tr>
            <th className="text-left pr-3">{t('paymentMethod')}</th>
            <td>{payment.type}</td>
          </tr>
        </table>
      </div>

      <h3 className="border-b-2 text-xl font-bold pb-1 mt-5 text-gray-600">
        {t('paymentMessage')}
      </h3>

      <p className="whitespace-pre p-3">{payment.message}</p>

      <h3 className="border-b-2 text-xl font-bold pb-1 mt-5 text-gray-600">
        {t('paymentSummary')}
      </h3>

      <ul className="p-3">
        {debtsAreLoading && "Loading..."}
        {(debts ?? []).map((debt) => (
          <li className="mb-2 tabular-nums">
            <h4 className="font-bold flex">
              <span className="flex-grow">{debt.name}</span>
              <span>{formatEuro(debt.debtComponents.map(dc => dc.amount).reduce(sumEuroValues, euro(0)))}</span>
            </h4>
            <div className="pl-3">
              <p>{debt.description}</p>
              <ul>
                {debt.debtComponents.map(dc => (
                  <li className="flex">
                    <span className="flex-grow">{dc.name}</span>
                    <span>{formatEuro(dc.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
        <li>
          <h4 className="font-bold flex">
            <span className="flex-grow">{t('total')}</span>
            <span>{formatEuro((debts ?? []).flatMap(d => d.debtComponents).map(dc => dc.amount).reduce(sumEuroValues, euro(0)))}</span>
          </h4>
        </li>
      </ul>

      <h3 className="border-b-2 text-xl font-bold pb-1 mt-5 text-gray-600">
        {t('paymentDetailsHeader')}
      </h3>

      {payment.type === 'invoice' && <InvoiceDetails payment={payment} />}

      <h3 className="border-b-2 text-xl font-bold pb-1 mt-5 text-gray-600">
        {t('paymentEventTimeline')}
      </h3>

      <Timeline
        events={[
          {
            time: new Date(payment.created_at),
            title: t('paymentCreated'),
          }
        ]}
      />
    </>
  )
}
