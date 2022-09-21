import { Link, Redirect, Route, Switch, useLocation, useRoute } from 'wouter'
import { tw } from '../../tailwind'
import { CreateDebtCenter } from './create-debt-center'
import { CreateDebtCenterFromEvent } from './create-debt-center-from-event'
import { PayerListing } from './payer-listing'
import { CreateDebt } from './create-debt'
import { DebtCenterDetails } from './debt-center'
import { DebtCentersListing } from './debt-centers-listing'
import { MassCreateDebts } from './mass-create-debts'
import { DebtDetails } from './debt-details'
import { DebtListing } from './debt-listing'
import { PayerDetails } from './payer-details'
import { PaymentDetails } from './payment-details'
import { PaymentsListing } from './payments-listing'
import { EmailsListing } from './emails-listing'
import { EmailDetails } from './email-details'
import { CornerDownLeft } from 'react-feather'

const MenuItemLi = tw.li`
  px-4
  rounded-md
  py-2.5
  hover:bg-black
  hover:bg-opacity-10
  my-1
`;

const MenuItem = ({ path, children }) => {
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
      onClick={() => setLocation(path)}
    >
      {children}
    </li>
  );
};

const Admin = () => {
  return (
    <div className="flex flex-row h-screen bg-[#fbfbfb]">
      <div className="flex-shrink flex flex-col w-80 bg-white border-r shadow-xl">
        <h1 className="text-xl text-center py-5">TKO-äly / Laskutuspalvelu</h1>
        <ul className="">
          <MenuItem path="/admin/debt-centers">Collections</MenuItem>
          <MenuItem path="/admin/debts">Debts</MenuItem>
          <MenuItem path="/admin/payments">Payments</MenuItem>
          <MenuItem path="/admin/payers">Payers</MenuItem>
          <MenuItem path="/admin/emails">Emails</MenuItem>
        </ul>
        <Link to='/' style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25em', margin: '1em', fontSize: '0.9em', color: 'gray' }}>Back to public site <CornerDownLeft style={{ height: '1em' }} className="text-blue-600" /></Link>
        <div className="flex-grow" />
        <div className="py-2.5 px-4 hover:border-l-8 border-blue-500 hover:pl-2 cursor-pointer hover:bg-gray-50">
          Log out
        </div>
      </div>
      <div className="flex-grow flex justify-center items-start overflow-y-scroll">
        <div className="flex-grow max-w-[50em] p-5">
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
            <Route path="/admin/debts/create" component={CreateDebt} />
            <Route path="/admin/debts/:id" component={DebtDetails} />
            <Route path="/admin/debts" component={DebtListing} />
            <Route path="/admin/payers" component={PayerListing} />
            <Route path="/admin/payers/:id" component={PayerDetails} />
            <Route path="/admin/payments" component={PaymentsListing} />
            <Route path="/admin/payments/:id" component={PaymentDetails} />
            <Route path="/admin/emails" component={EmailsListing} />
            <Route path="/admin/emails/:id" component={EmailDetails} />
            <Route path="/admin/:rest*">
              <Redirect to="/admin/debt-centers" />
            </Route>
          </Switch>
        </div>
      </div>
    </div>
  );
};

export default Admin
