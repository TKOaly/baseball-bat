import { Redirect, Route, Switch, useLocation } from 'wouter';
import { CreateDebtCenter } from './create-debt-center';
import { CreateDebtCenterFromEvent } from './create-debt-center-from-event';
import { Notification } from '../../components/notification';
import { DialogTarget, useDialog } from '../../components/dialog';
import { twMerge } from 'tailwind-merge';
import { PayerListing } from './payer-listing';
import { Banking } from './banking';
import { ImportXMLStatement } from './import-xml-statement';
import { CreateDebt } from './create-debt';
import { DebtCenterDetails } from './debt-center';
import { DebtCentersListing } from './debt-centers-listing';
import { MassCreateDebts } from './mass-create-debts';
import { DebtDetails } from './debt-details';
import { DebtListing } from './debt-listing';
import { PayerDetails } from './payer-details';
import { EditPayer } from './edit-payer';
import { PaymentDetails } from './payment-details';
import { BankStatement } from './bank-statement';
import { PaymentsListing } from './payments-listing';
import { EmailsListing } from './emails-listing';
import { EmailDetails } from './email-details';
import { BankAccount } from './bank-account';
import { CreateBankAccount } from './create-bank-account';
import { useEffect, useState } from 'react';
import { GlobalSearchDialog } from '../../components/dialogs/global-search-dialog';
import { TextField } from '../../components/text-field';
import { EditDebt } from '../edit-debt';
import { EditDebtCenter } from './edit-debt-center';
import { ReportsListing } from './reports-listing';
import { JobsListing } from './jobs-listing';
import { JobDetails } from './job-details';
import { Dropdown } from '../../components/dropdown';
import { useGetAccountingPeriodsQuery } from '../../api/accounting';
import { useAppDispatch, useAppSelector } from '../../store';
import accountingPeriodSlice from '../../state/accounting-period';
import { selectActiveNotifications } from '../../state/notifications';

type MenuItemProps = {
  path?: string;
  onClick?: () => void;
  className?: string;
  active?: boolean;
};

const MenuItem: React.FC<MenuItemProps> = ({
  path,
  active,
  onClick,
  children,
  className,
}) => {
  const [location, setLocation] = useLocation();
  let matched = location.indexOf(path) === 0;

  if (active !== undefined) {
    matched = active;
  }

  return (
    <li
      className={twMerge(
        `
        px-4
        py-1
        relative
        cursor-pointer
        border-b-2
        border-t-2
        border-gray-50
        group
        hover:bg-gray-100
        ${matched && 'bg-gray-100'}
      `,
        className,
      )}
      onClick={() => {
        onClick?.();

        if (path) {
          setLocation(path);
        }
      }}
    >
      <div
        className={`absolute left-0 top-0 bottom-0 ${
          matched ? 'bg-blue-500 w-1.5' : 'bg-gray-300 w-0'
        } group-hover:w-1.5 duration-200`}
      />
      {children}
    </li>
  );
};

const AccountingPeriodSelector = () => {
  const { data: accountingPeriods } = useGetAccountingPeriodsQuery();
  const activeAccountingPeriod = useAppSelector(
    state => state.accountingPeriod.activePeriod,
  );
  const dispatch = useAppDispatch();

  return (
    <div className="flex gap-2 items-center px-4 mt-3">
      <span className="text-sm">Accounting Period: </span>
      <Dropdown
        label={
          activeAccountingPeriod ? `${activeAccountingPeriod}` : 'Loading...'
        }
        options={(accountingPeriods ?? [])
          .filter(period => !period.closed)
          .map(period => ({ value: period.year, text: `${period.year}` }))}
        onSelect={period =>
          dispatch(
            accountingPeriodSlice.actions.setActiveAccountingPeriod({ period }),
          )
        }
      />
    </div>
  );
};

const Admin = () => {
  const [width, setWidth] = useState<'narrow' | 'wide' | 'full'>('narrow');
  const showSearchDialog = useDialog(GlobalSearchDialog);
  const { data: accountingPeriods } = useGetAccountingPeriodsQuery();
  const activeAccountingPeriod = useAppSelector(
    state => state.accountingPeriod.activePeriod,
  );
  const notifications = useAppSelector(state =>
    selectActiveNotifications(state),
  );
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (activeAccountingPeriod === null && accountingPeriods) {
      dispatch(accountingPeriodSlice.actions.bootstrap(accountingPeriods));
    }
  }, [accountingPeriods, activeAccountingPeriod, dispatch]);

  useEffect(() => {
    const handler = (evt: KeyboardEvent) => {
      if (evt.key === '/' && evt.target === document.body) {
        evt.preventDefault();
        showSearchDialog({ openOnSelect: true });
      }
    };

    window.addEventListener('keydown', handler);

    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="flex flex-row h-screen bg-white">
      <div className="flex-shrink-0 flex flex-col w-80 bg-gray-50 border-r border-[#ececec]">
        <h1 className="text-xl text-center py-5">TKO-äly / Laskutuspalvelu</h1>
        <TextField
          placeholder="Search..."
          className="mx-3 mb-5"
          onClick={() => showSearchDialog({ openOnSelect: true })}
        />
        <ul className="">
          <MenuItem path="/admin/debt-centers">Collections</MenuItem>
          <MenuItem path="/admin/debts">Debts</MenuItem>
          <MenuItem path="/admin/payments">Payments</MenuItem>
          <MenuItem path="/admin/payers">Payers</MenuItem>
          <MenuItem path="/admin/emails">Emails</MenuItem>
          <MenuItem path="/admin/banking">Banking</MenuItem>
          <MenuItem path="/admin/reports">Reports</MenuItem>
          <MenuItem path="/admin/jobs">Jobs</MenuItem>
          <MenuItem path="/" active={false} className="mt-4">
            Back to public site
          </MenuItem>
          <MenuItem path="#">Log out</MenuItem>
        </ul>
        <AccountingPeriodSelector />
        <div className="flex-grow" />
        <ul className="flex justify-center">
          <li
            className={`px-4 py-2.5 border-b-4 cursor-pointer hover:bg-blue-50 ${
              width === 'narrow' && 'border-blue-500'
            }`}
            onClick={() => setWidth('narrow')}
          >
            Narrow
          </li>
          <li
            className={`px-4 py-2.5 border-b-4 cursor-pointer hover:bg-blue-50 ${
              width === 'wide' && 'border-blue-500'
            }`}
            onClick={() => setWidth('wide')}
          >
            Wide
          </li>
          <li
            className={`px-4 py-2.5 border-b-4 cursor-pointer hover:bg-blue-50 ${
              width === 'full' && 'border-blue-500'
            }`}
            onClick={() => setWidth('full')}
          >
            Full
          </li>
        </ul>
      </div>
      <div className="flex-grow flex justify-center items-start overflow-y-scroll">
        <div
          className={`flex-grow ${
            { narrow: 'max-w-[50em]', wide: 'max-w-[80em]', full: '' }[width]
          } py-5 mx-40`}
        >
          <Switch>
            <Route path="/admin/debt-centers" component={DebtCentersListing} />
            <Route
              path="/admin/debt-centers/create"
              component={CreateDebtCenter}
            />
            <Route
              path="/admin/debt-centers/create-from-event"
              component={CreateDebtCenterFromEvent}
            />
            <Route path="/admin/debts/create-debts-csv">
              {params => <MassCreateDebts params={params} defaults={{}} />}
            </Route>
            <Route path="/admin/debt-centers/:id">
              {({ id }: { id: string }) => <DebtCenterDetails id={id} />}
            </Route>
            <Route path="/admin/debt-centers/:id/create-debt">
              {({ id }: { id: string }) => <CreateDebt debtCenterId={id} />}
            </Route>
            <Route path="/admin/debt-centers/:id/create-debts-csv">
              {(params: { id: string }) => (
                <MassCreateDebts
                  params={params}
                  defaults={{ debtCenter: params.id }}
                />
              )}
            </Route>
            <Route
              path="/admin/debt-centers/:id/edit"
              component={EditDebtCenter}
            />
            <Route path="/admin/debts/create" component={CreateDebt} />
            <Route path="/admin/debts/:id" component={DebtDetails} />
            <Route path="/admin/debts/:id/edit" component={EditDebt} />
            <Route path="/admin/debts" component={DebtListing} />
            <Route path="/admin/payers" component={PayerListing} />
            <Route path="/admin/payers/:id" component={PayerDetails} />
            <Route path="/admin/payers/:id/edit" component={EditPayer} />
            <Route path="/admin/payments" component={PaymentsListing} />
            <Route path="/admin/payments/:id" component={PaymentDetails} />
            <Route path="/admin/emails" component={EmailsListing} />
            <Route path="/admin/emails/:id" component={EmailDetails} />
            <Route path="/admin/banking" component={Banking} />
            <Route path="/admin/banking/accounts" component={Banking} />
            <Route
              path="/admin/banking/accounts/create"
              component={CreateBankAccount}
            />
            <Route path="/admin/banking/accounts/:id">
              {({ id }) => <BankAccount iban={id} />}
            </Route>
            <Route path="/admin/banking/statements/:id">
              {({ id }: { id: string }) => <BankStatement id={id} />}
            </Route>
            <Route
              path="/admin/banking/import-statement"
              component={ImportXMLStatement}
            />
            <Route path="/admin/reports" component={ReportsListing} />
            <Route path="/admin/jobs" component={JobsListing} />
            <Route path="/admin/jobs/:queue/:id">
              {({ id, queue }) => <JobDetails id={id} queue={queue} />}
            </Route>
            <Route path="/admin/:rest*">
              <Redirect to="/admin/debt-centers" />
            </Route>
          </Switch>
        </div>
      </div>
      <div onClick={evt => evt.stopPropagation()} data-cy="dialogs">
        <DialogTarget />
      </div>
      <div className="absolute right-0 top-0 h-[100vh] flex flex-col justify-end w-[25em] p-4 gap-3 pointer-events-none">
        {notifications.map(notification => (
          <Notification key={notification.id} {...notification} />
        ))}
      </div>
    </div>
  );
};

export default Admin;
