import React from 'react'
import { useTranslation } from 'react-i18next'
import { euro, formatEuro, sumEuroValues } from '../../common/currency'
import debtApi from '../api/debt'
import { createMultiFetchHook } from '../hooks/create-multi-fetch-hook'
import { useAppSelector } from '../store'
import { ChevronRight, Mail } from 'react-feather'
import { useCreateInvoiceMutation } from '../api/payments'
import { useLocation } from 'wouter'

const useFetchDebts = createMultiFetchHook(debtApi.endpoints.getDebt)

const InvoiceIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" {...props}>
    <path d="M64 0C28.7 0 0 28.7 0 64V448c0 35.3 28.7 64 64 64H320c35.3 0 64-28.7 64-64V160H256c-17.7 0-32-14.3-32-32V0H64zM256 0V128H384L256 0zM64 80c0-8.8 7.2-16 16-16h64c8.8 0 16 7.2 16 16s-7.2 16-16 16H80c-8.8 0-16-7.2-16-16zm0 64c0-8.8 7.2-16 16-16h64c8.8 0 16 7.2 16 16s-7.2 16-16 16H80c-8.8 0-16-7.2-16-16zm128 72c8.8 0 16 7.2 16 16v17.3c8.5 1.2 16.7 3.1 24.1 5.1c8.5 2.3 13.6 11 11.3 19.6s-11 13.6-19.6 11.3c-11.1-3-22-5.2-32.1-5.3c-8.4-.1-17.4 1.8-23.6 5.5c-5.7 3.4-8.1 7.3-8.1 12.8c0 3.7 1.3 6.5 7.3 10.1c6.9 4.1 16.6 7.1 29.2 10.9l.5 .1 0 0 0 0c11.3 3.4 25.3 7.6 36.3 14.6c12.1 7.6 22.4 19.7 22.7 38.2c.3 19.3-9.6 33.3-22.9 41.6c-7.7 4.8-16.4 7.6-25.1 9.1V440c0 8.8-7.2 16-16 16s-16-7.2-16-16V422.2c-11.2-2.1-21.7-5.7-30.9-8.9l0 0c-2.1-.7-4.2-1.4-6.2-2.1c-8.4-2.8-12.9-11.9-10.1-20.2s11.9-12.9 20.2-10.1c2.5 .8 4.8 1.6 7.1 2.4l0 0 0 0 0 0c13.6 4.6 24.6 8.4 36.3 8.7c9.1 .3 17.9-1.7 23.7-5.3c5.1-3.2 7.9-7.3 7.8-14c-.1-4.6-1.8-7.8-7.7-11.6c-6.8-4.3-16.5-7.4-29-11.2l-1.6-.5 0 0c-11-3.3-24.3-7.3-34.8-13.7c-12-7.2-22.6-18.9-22.7-37.3c-.1-19.4 10.8-32.8 23.8-40.5c7.5-4.4 15.8-7.2 24.1-8.7V232c0-8.8 7.2-16 16-16z" />
  </svg>
)

const StripeIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" {...props}>
    <path d="M165 144.7l-43.3 9.2-.2 142.4c0 26.3 19.8 43.3 46.1 43.3 14.6 0 25.3-2.7 31.2-5.9v-33.8c-5.7 2.3-33.7 10.5-33.7-15.7V221h33.7v-37.8h-33.7zm89.1 51.6l-2.7-13.1H213v153.2h44.3V233.3c10.5-13.8 28.2-11.1 33.9-9.3v-40.8c-6-2.1-26.7-6-37.1 13.1zm92.3-72.3l-44.6 9.5v36.2l44.6-9.5zM44.9 228.3c0-6.9 5.8-9.6 15.1-9.7 13.5 0 30.7 4.1 44.2 11.4v-41.8c-14.7-5.8-29.4-8.1-44.1-8.1-36 0-60 18.8-60 50.2 0 49.2 67.5 41.2 67.5 62.4 0 8.2-7.1 10.9-17 10.9-14.7 0-33.7-6.1-48.6-14.2v40c16.5 7.1 33.2 10.1 48.5 10.1 36.9 0 62.3-15.8 62.3-47.8 0-52.9-67.9-43.4-67.9-63.4zM640 261.6c0-45.5-22-81.4-64.2-81.4s-67.9 35.9-67.9 81.1c0 53.5 30.3 78.2 73.5 78.2 21.2 0 37.1-4.8 49.2-11.5v-33.4c-12.1 6.1-26 9.8-43.6 9.8-17.3 0-32.5-6.1-34.5-26.9h86.9c.2-2.3.6-11.6.6-15.9zm-87.9-16.8c0-20 12.3-28.4 23.4-28.4 10.9 0 22.5 8.4 22.5 28.4zm-112.9-64.6c-17.4 0-28.6 8.2-34.8 13.9l-2.3-11H363v204.8l44.4-9.4.1-50.2c6.4 4.7 15.9 11.2 31.4 11.2 31.8 0 60.8-23.2 60.8-79.6.1-51.6-29.3-79.7-60.5-79.7zm-10.6 122.5c-10.4 0-16.6-3.8-20.9-8.4l-.3-66c4.6-5.1 11-8.8 21.2-8.8 16.2 0 27.4 18.2 27.4 41.4.1 23.9-10.9 41.8-27.4 41.8zm-126.7 33.7h44.6V183.2h-44.6z" />
  </svg>
)

export const NewPayment = () => {
  const { t } = useTranslation()
  const [, setLocation] = useLocation()
  const [createInvoice] = useCreateInvoiceMutation()
  const selectedDebts = useAppSelector((state) => state.paymentPool.selectedPayments)
  const { data: debts } = useFetchDebts(selectedDebts)

  const handleCreateInvoice = async () => {
    const result = await createInvoice({
      debts: selectedDebts,
      sendEmail: true,
    });

    if ('data' in result) {
      setLocation(`/payment/${result.data.id}`)
    }
  }

  return (
    <>
      <h3 className="text-xl text-gray-500 font-bold">
        {t('newPaymentHeader')}
      </h3>

      <h3 className="border-b-2 text-xl font-bold pb-1 mt-5 text-gray-600">
        {t('selectedDebtsSummary')}
      </h3>

      <ul>
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
        {t('selectPaymentMethod')}
      </h3>

      <div>
        <div className="rounded-md flex items-center border group border-gray-300 hover:border-blue-400 mt-5 p-4 shadow-sm cursor-pointer" onClick={() => handleCreateInvoice()}>
          <InvoiceIcon className="w-5 h-5 mr-3 text-gray-300" />
          <div className="flex-grow">
            <h3 className="font-bold">{t('invoice')}</h3>
            <p className="text-sm text-gray-700">{t('invoiceDescription')}</p>
          </div>
          <ChevronRight className="h-8 w-8 text-gray-400 ml-3 hover:bg-gray-200 rounded-full" />
        </div>

        <div className="rounded-md flex items-center border group border-gray-300 opacity-50 mt-5 p-4 shadow-sm cursor-not-allowed" onClick={() => toggleDebtSelection(p)}>
          <StripeIcon className="w-5 h-5 mr-3 text-gray-300" />
          <div className="flex-grow">
            <h3 className="font-bold">{t('stripe')} <span className="font-normal text-gray-600">({t('stripeDisclaimer')})</span></h3>
            <p className="text-sm text-gray-700">{t('stripeDescription')}</p>
          </div>
          <ChevronRight className="h-8 w-8 text-gray-400 ml-3 rounded-full" />
        </div>
      </div>
    </>
  )
}
