import { ReactElement } from 'react'
import { ExternalLink } from 'react-feather'
import { Link } from 'wouter'
import { useGetEmailQuery } from '../../api/email'
import { useGetPayerByEmailQuery } from '../../api/payers'
import { Breadcrumbs } from '../../components/breadcrumbs'

export const EmailDetails = ({ params }: { params: { id: string } }) => {
  const { data: email } = useGetEmailQuery(params.id)
  const { data: payer, isLoading: isPayerLoading } = useGetPayerByEmailQuery(email?.recipient, { skip: !email })

  if (!email) {
    return <div>Loading...</div>
  }

  let status = 'Pending'

  if (email.draft) {
    status = 'Draft';
  }

  if (email.sentAt) {
    status = 'Sent';
  }

  let payerField: ReactElement | string = 'No profile found'

  if (isPayerLoading) {
    payerField = 'Loading...'
  } else if (payer) {
    payerField = (
      <Link to={`/admin/payers/${payer.id.value}`} className="mt-1 flex items-center cursor-pointer gap-1">
        {payer.name}
        <ExternalLink className="h-4 text-blue-500 relative" />
      </Link>
    );
  }

  return (
    <>
      <h1 className="text-2xl mb-5 mt-10">
        <Breadcrumbs
          segments={[
            { url: '/admin/emails', text: 'Emails' },
            email?.subject ?? '',
          ]}
        />
      </h1>
      <div className="grid grid-cols-2 gap-x-8">
        <div className="my-4">
          <div className="text-gray-500 text-xs font-bold uppercase">Subject</div>
          <div className="mt-1">{email.subject}</div>
        </div>
        <div className="my-4">
          <div className="text-gray-500 text-xs font-bold uppercase">Recipient</div>
          <div className="mt-1">{email.recipient}</div>
        </div>
        <div className="my-4">
          <div className="text-gray-500 text-xs font-bold uppercase">Payer</div>
          <div className="mt-1">{payerField}</div>
        </div>
        <div className="my-4">
          <div className="text-gray-500 text-xs font-bold uppercase">Template</div>
          <div className="mt-1">{email.template}</div>
        </div>
        <div className="my-4">
          <div className="text-gray-500 text-xs font-bold uppercase">Status</div>
          <div className="mt-1">{status}</div>
        </div>
        <div className="my-4 col-span-full">
          <div className="text-gray-500 text-xs font-bold uppercase">Preview</div>
          <div className="mt-1 overflow-hidden rounded-md border shadow">
            <iframe src={`/api/emails/${params.id}/render`} className="h-[30em] w-full"></iframe>
          </div>
        </div>
      </div>
    </>
  )
}
