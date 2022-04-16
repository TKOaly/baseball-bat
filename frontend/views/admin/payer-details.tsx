import { Breadcrumbs } from '../../components/breadcrumbs'
import { useGetPayerEmailsQuery, useGetPayerQuery } from '../../api/payers'

export const PayerDetails = ({ params }) => {
  const { data: payer } = useGetPayerQuery(params.id)
  const { data: emails } = useGetPayerEmailsQuery(params.id)

  if (!payer || !emails)
    return 'Loading...'

  return <>
    <h1 className="text-2xl mt-10 mb-5">
      <Breadcrumbs
        segments={[
          { url: '/admin/payers', text: 'Payers' },
          payer?.name ?? '',
        ]}
      />
    </h1>
    <div className="grid grid-cols-2 gap-x-8">
      <div className="my-4">
        <div className="text-gray-500 text-xs font-bold uppercase">Name</div>
        <div className="mt-1">{payer?.name}</div>
      </div>
      <div className="my-4">
        <div className="text-gray-500 text-xs font-bold uppercase">Emails</div>
        <div className="mt-1">
          {emails.map((email) => (
            <span title={`Source: ${email.source}`} className={`rounded-[3pt] text-sm py-0.5 px-2 ${{ primary: 'bg-blue-500 text-white', default: 'bg-gray-500 text-black', disabled: 'bg-gray-200 text-gray-500' }[email.priority]}`}>{email.email}</span>
          ))}
        </div>
      </div>
    </div>
  </>
}
