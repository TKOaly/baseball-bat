import { Link, Redirect, Route, Switch, useLocation } from 'wouter'
import { tw } from '../../tailwind'
import { CreateDebtCenter } from './create-debt-center'
import { CreateDebtCenterFromEvent } from './create-debt-center-from-event'
import { DialogTarget, useDialog } from '../../components/dialog'
import { PayerListing } from './payer-listing'
import { Banking } from './banking'
import { ImportXMLStatement } from './import-xml-statement'
import { CreateDebt } from './create-debt'
import { DebtCenterDetails } from './debt-center'
import { DebtCentersListing } from './debt-centers-listing'
import { MassCreateDebts } from './mass-create-debts'
import { DebtDetails } from './debt-details'
import { DebtListing } from './debt-listing'
import { PayerDetails } from './payer-details'
import { PaymentDetails } from './payment-details'
import { BankStatement } from './bank-statement'
import { PaymentsListing } from './payments-listing'
import { EmailsListing } from './emails-listing'
import { EmailDetails } from './email-details'
import { BankAccount } from './bank-account'
import { CreateBankAccount } from './create-bank-account'
import { CornerDownLeft } from 'react-feather'
import { useEffect, useState } from 'react'
import { GlobalSearchDialog } from '../../components/dialogs/global-search-dialog'
import { TextField } from '../../components/text-field'
import { EditDebt } from '../edit-debt'
import { EditDebtCenter } from './edit-debt-center'

const MenuItemLi = tw.li`
  px-4
  rounded-md
  py-2.5
  hover:bg-black
  hover:bg-opacity-10
  my-1
`;

type MenuItemProps = {
  path?: string
  onClick?: () => void
}

const MenuItem: React.FC<MenuItemProps> = ({ path, onClick, children }) => {
  const [location, setLocation] = useLocation()
  const matched = location.indexOf(path) === 0

  return (
    <li
      className={`
        px-4
        py-2.5
        hover:bg-gray-50
        cursor-pointer
        ${matched && 'border-l-8 border-blue-500 bg-gray-50 pl-2'}
        my-1
      `}
      onClick={() => {
        onClick?.();

        if (path) {
          setLocation(path)
        }
      }}
    >
      {children}
    </li>
  );
};

const Admin = () => {
  const [width, setWidth] = useState<'narrow' | 'wide' | 'full'>('narrow')
  const showSearchDialog = useDialog(GlobalSearchDialog)

  useEffect(() => {
    const handler = (evt) => {
      if (evt.key === '/' && evt.target === document.body) {
        showSearchDialog({ openOnSelect: true });
      }
    };

    window.addEventListener('keydown', handler);

    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="flex flex-row h-screen bg-[#fbfbfb]">
      <div className="flex-shrink flex flex-col w-80 bg-white border-r shadow-xl">
        <h1 className="text-xl text-center py-5">TKO-äly / Laskutuspalvelu</h1>
        <TextField placeholder="Search..." className="mx-3 mb-3" onClick={() => showSearchDialog({ openOnSelect: true })} />
        <ul className="">
          <MenuItem path="/admin/debt-centers">Collections</MenuItem>
          <MenuItem path="/admin/debts">Debts</MenuItem>
          <MenuItem path="/admin/payments">Payments</MenuItem>
          <MenuItem path="/admin/payers">Payers</MenuItem>
          <MenuItem path="/admin/emails">Emails</MenuItem>
          <MenuItem path="/admin/banking">Banking</MenuItem>
        </ul>
        <div className="py-2.5 px-4 hover:border-l-8 border-blue-500 hover:pl-2 cursor-pointer hover:bg-gray-50">
          Log out
        </div>
        <Link to='/' style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25em', margin: '1em', fontSize: '0.9em', color: 'gray' }}>Back to public site <CornerDownLeft style={{ height: '1em' }} className="text-blue-600" /></Link>
        <div className="flex-grow" />
        <ul className="flex justify-center">
          <li className={`px-4 py-2.5 border-b-4 cursor-pointer hover:bg-blue-50 ${width === 'narrow' && 'border-blue-500'}`} onClick={() => setWidth('narrow')}>Narrow</li>
          <li className={`px-4 py-2.5 border-b-4 cursor-pointer hover:bg-blue-50 ${width === 'wide' && 'border-blue-500'}`} onClick={() => setWidth('wide')}>Wide</li>
          <li className={`px-4 py-2.5 border-b-4 cursor-pointer hover:bg-blue-50 ${width === 'full' && 'border-blue-500'}`} onClick={() => setWidth('full')}>Full</li>
        </ul>
      </div>
      <div className="flex-grow flex justify-center items-start overflow-y-scroll">
        <div className={`flex-grow ${{ 'narrow': 'max-w-[50em]', 'wide': 'max-w-[80em]', 'full': '' }[width]} py-5 mx-40`}>
          <Switch>
            <Route path="/admin/debt-centers" component={DebtCentersListing} />
            <Route path="/admin/debt-centers/create" component={CreateDebtCenter} />
            <Route path="/admin/debt-centers/create-from-event" component={CreateDebtCenterFromEvent} />
            <Route path="/admin/debts/create-debts-csv">
              {(params) => <MassCreateDebts params={params} defaults={{}} />}
            </Route>
            <Route path="/admin/debt-centers/:id">
              {(params) => (params &&
                <DebtCenterDetails id={(params as any).id} />
              )}
            </Route>
            <Route path="/admin/debt-centers/:id/create-debt">
              {({ id }: { id: string }) => <CreateDebt debtCenterId={id} />}
            </Route>
            <Route path="/admin/debt-centers/:id/create-debts-csv">
              {(params) => <MassCreateDebts params={params} defaults={{ debtCenter: params.id }} />}
            </Route>
            <Route path="/admin/debt-centers/:id/edit" component={EditDebtCenter} />
            <Route path="/admin/debts/create" component={CreateDebt} />
            <Route path="/admin/debts/:id" component={DebtDetails} />
            <Route path="/admin/debts/:id/edit" component={EditDebt} />
            <Route path="/admin/debts" component={DebtListing} />
            <Route path="/admin/payers" component={PayerListing} />
            <Route path="/admin/payers/:id" component={PayerDetails} />
            <Route path="/admin/payments" component={PaymentsListing} />
            <Route path="/admin/payments/:id" component={PaymentDetails} />
            <Route path="/admin/emails" component={EmailsListing} />
            <Route path="/admin/emails/:id" component={EmailDetails} />
            <Route path="/admin/banking" component={Banking} />
            <Route path="/admin/banking/accounts" component={Banking} />
            <Route path="/admin/banking/accounts/create" component={CreateBankAccount} />
            <Route path="/admin/banking/accounts/:id">
              {({ id }) => <BankAccount iban={id} />}
            </Route>
            <Route path="/admin/banking/statements/:id">
              {({ id }: { id: string }) => <BankStatement id={id} />}
            </Route>
            <Route path="/admin/banking/import-statement" component={ImportXMLStatement} />
            <Route path="/admin/:rest*">
              <Redirect to="/admin/debt-centers" />
            </Route>
          </Switch>
        </div>
      </div>
      <div onClick={(evt) => evt.stopPropagation()}>
        <DialogTarget />
      </div>
    </div>
  );
};

export default Admin
