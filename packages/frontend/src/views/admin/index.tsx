import { PropsWithChildren, useEffect, useRef, useState } from 'react';
import { Route, Redirect, Switch, useLocation } from 'wouter';
import { GlobalSearchDialog } from '../../components/dialogs/global-search-dialog';
import { Notification } from '@bbat/ui/notification';
import { DialogTarget, useDialog } from '../../components/dialog';
import { TextField } from '@bbat/ui/text-field';
import { twMerge } from 'tailwind-merge';
import { Dropdown, DropdownItem } from '@bbat/ui/dropdown';

import { useGetAccountingPeriodsQuery } from '../../api/accounting';
import { useAppDispatch, useAppSelector } from '../../store';
import accountingPeriodSlice from '../../state/accounting-period';
import {
  default as notificationsSlice,
  selectActiveNotifications,
} from '../../state/notifications';

import { DebtCentersListing } from './debt-centers-listing';
import { DebtCenterDetails } from './debt-center';
import { CreateDebtCenter } from './create-debt-center';
import { CreateDebtCenterFromEvent } from './create-debt-center-from-event';
import { DebtListing } from './debt-listing';
import { DebtDetails } from './debt-details';
import { CreateDebt } from './create-debt';
import { EditDebtCenter } from './edit-debt-center';
import { EditDebt } from './edit-debt';
import { PaymentsListing } from './payments-listing';
import { PaymentDetails } from './payment-details';
import { PayerListing } from './payer-listing';
import { PayerDetails } from './payer-details';
import { EditPayer } from './edit-payer';
import { EmailsListing } from './emails-listing';
import { EmailDetails } from './email-details';
import { Banking } from './banking';
import { CreateBankAccount } from './create-bank-account';
import { BankAccount } from './bank-account';
import { BankStatement } from './bank-statement';
import { ReportsListing } from './reports-listing';
import { JobsListing } from './jobs-listing';
import { JobDetails } from './job-details';
import { ImportXMLStatement } from './import-xml-statement';
import { MassCreateDebts } from './mass-create-debts';
import { cva } from 'class-variance-authority';
import { Menu, X } from 'react-feather';
import { AuditEvents } from './audit';
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorPage } from './error-page';

const sidebarCva = cva(
  `
  flex-shrink-0
  flex-col
  absolute
  h-screen
  duration-200
  z-50
  bg-gray-50
  border-r
  border-[#ececec]
  w-[20em] 
`,
  {
    variants: {
      open: {
        true: 'shadow-lg xl:shadow-none right-[calc(100%_-_20em)]',
        undefined: 'right-full xl:right-[calc(100%_-_20em)]',
        false: 'right-full',
      },
    },
  },
);

const sidebarToggleButtonCommonClasses =
  'absolute left-full m-2 h-8 w-8 rounded-md flex items-center justify-center bg-gray-500/5 hover:bg-gray-500/10 cursor-pointer';

const closeButtonCva = cva(sidebarToggleButtonCommonClasses, {
  variants: {
    open: {
      true: 'flex',
      undefined: 'hidden xl:flex',
      false: 'hidden',
    },
  },
});

const openButtonCva = cva(sidebarToggleButtonCommonClasses, {
  variants: {
    open: {
      true: 'hidden',
      undefined: 'flex xl:hidden',
      false: 'flex',
    },
  },
});

const contentCva = cva(
  'flex-grow flex justify-center items-start overflow-y-scroll duration-200',
  {
    variants: {
      sidebarOpen: {
        true: 'xl:pl-[20em]',
        undefined: 'xl:pl-[20em]',
        false: '',
      },
    },
  },
);

type MenuItemProps = PropsWithChildren<{
  path?: string;
  onClick?: () => void;
  className?: string;
  active?: boolean;
}>;

const MenuItem: React.FC<MenuItemProps> = ({
  path,
  active,
  onClick,
  children,
  className,
}) => {
  const [location, setLocation] = useLocation();
  let matched = path && location.indexOf(path) === 0;

  if (active !== undefined) {
    matched = active;
  }

  return (
    <li
      className={twMerge(
        `
        group
        relative
        cursor-pointer
        border-b-2
        border-t-2
        border-gray-50
        px-4
        py-1
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
        className={`absolute bottom-0 left-0 top-0 ${
          matched ? 'w-1.5 bg-blue-500' : 'w-0 bg-gray-300'
        } duration-200 group-hover:w-1.5`}
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

  const handleSelect = (period: number) => {
    dispatch(
      accountingPeriodSlice.actions.setActiveAccountingPeriod({ period }),
    );
  };

  const label = activeAccountingPeriod
    ? `${activeAccountingPeriod}`
    : 'Loading...';

  const openPeriods = (accountingPeriods ?? []).filter(p => !p.closed);

  return (
    <div className="mt-3 flex items-center gap-2 px-4">
      <span className="text-sm">Accounting Period: </span>
      <Dropdown flat label={label} onSelect={handleSelect}>
        {openPeriods.map(({ year }) => (
          <DropdownItem label={year.toString()} value={year} />
        ))}
      </Dropdown>
    </div>
  );
};

const Admin = () => {
  const [sidebarOpen, setSidebarOpen] = useState<boolean | undefined>(
    undefined,
  );
  const sidebarRef = useRef<HTMLDivElement>(null);
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
    const handler = (evt: MouseEvent) => {
      if (
        evt.target &&
        sidebarRef.current &&
        !sidebarRef.current.contains(evt.target as Node) &&
        window.matchMedia('(max-width: 1279px)').matches
      ) {
        setSidebarOpen(false);
      }
    };

    document.addEventListener('click', handler);

    return () => sidebarRef.current?.removeEventListener('click', handler);
  }, [sidebarRef]);

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

  const sidebarToggleButton = (open: boolean) => {
    const cva = open ? closeButtonCva : openButtonCva;
    const Icon = open ? X : Menu;

    return (
      <div
        data-testid={`side-navigation-${open ? 'close' : 'open'}`}
        className={cva({ open: sidebarOpen })}
        onClick={() => setSidebarOpen(!open)}
      >
        <Icon />
      </div>
    );
  };

  return (
    <div className="flex h-screen flex-row bg-white">
      <div className={sidebarCva({ open: sidebarOpen })} ref={sidebarRef}>
        {sidebarToggleButton(true)}
        {sidebarToggleButton(false)}
        <h1 className="py-5 text-center text-xl">TKO-äly / Laskutuspalvelu</h1>
        <TextField
          placeholder="Search..."
          className="mx-3 mb-5"
          onClick={() => showSearchDialog({ openOnSelect: true })}
        />
        <ul data-testid="side-navigation">
          <MenuItem path="/admin/debt-centers">Collections</MenuItem>
          <MenuItem path="/admin/debts">Debts</MenuItem>
          <MenuItem path="/admin/payments">Payments</MenuItem>
          <MenuItem path="/admin/payers">Payers</MenuItem>
          <MenuItem path="/admin/emails">Emails</MenuItem>
          <MenuItem path="/admin/banking">Banking</MenuItem>
          <MenuItem path="/admin/reports">Reports</MenuItem>
          <MenuItem path="/admin/audit">Audit</MenuItem>
          <MenuItem path="/admin/jobs">Jobs</MenuItem>
          <MenuItem path="/" active={false} className="mt-4">
            Back to public site
          </MenuItem>
          <MenuItem path="#">Log out</MenuItem>
        </ul>
        <AccountingPeriodSelector />
      </div>
      <div className={contentCva({ sidebarOpen })}>
        <div className="w-full flex-grow px-12">
          <ErrorBoundary FallbackComponent={ErrorPage}>
            <Switch>
              <Route
                path="/admin/debt-centers"
                component={DebtCentersListing}
              />
              <Route
                path="/admin/debt-centers/create"
                component={CreateDebtCenter}
              />
              <Route
                path="/admin/debt-centers/create-from-event"
                component={CreateDebtCenterFromEvent}
              />
              <Route
                path="/admin/debt-centers/:id/edit"
                component={EditDebtCenter}
              />
              <Route path="/admin/debt-centers/:id">
                {({ id }: { id: string }) => <DebtCenterDetails id={id} />}
              </Route>
              <Route path="/admin/debts" component={DebtListing} />
              <Route path="/admin/debt-centers/:id/create-debt">
                {({ id }: { id: string }) => <CreateDebt debtCenterId={id} />}
              </Route>
              <Route path="/admin/debts/create">
                <CreateDebt />
              </Route>
              <Route path="/admin/debts/create-debts-csv">
                <MassCreateDebts />
              </Route>
              <Route path="/admin/debts/:id" component={DebtDetails} />
              <Route path="/admin/debts/:id/edit" component={EditDebt} />
              <Route path="/admin/payments" component={PaymentsListing} />
              <Route path="/admin/payments/:id" component={PaymentDetails} />
              <Route path="/admin/payers" component={PayerListing} />
              <Route path="/admin/payers/:id" component={PayerDetails} />
              <Route path="/admin/payers/:id/edit" component={EditPayer} />
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
              <Route path="/admin/reports" component={ReportsListing} />
              <Route path="/admin/jobs" component={JobsListing} />
              <Route path="/admin/jobs/:id" component={JobDetails} />
              <Route
                path="/admin/banking/import-statement"
                component={ImportXMLStatement}
              />
              <Route path="/admin/debt-centers/:id/create-debts-csv">
                {(params: { id: string }) => (
                  <MassCreateDebts debtCenterId={params.id} />
                )}
              </Route>
              <Route path="/admin/audit" component={AuditEvents} />
              <Route>
                <Redirect to="/admin/debt-centers" />
              </Route>
            </Switch>
          </ErrorBoundary>
        </div>
      </div>
      <div onClick={evt => evt.stopPropagation()} data-cy="dialogs">
        <DialogTarget />
      </div>
      <div className="pointer-events-none absolute right-0 top-0 flex h-[100vh] w-[25em] flex-col justify-end gap-3 p-4">
        {notifications.map(notification => (
          <Notification
            key={notification.id}
            onDismiss={() =>
              dispatch(
                notificationsSlice.actions.dismissNotification({
                  id: notification.id,
                }),
              )
            }
            {...notification}
          />
        ))}
      </div>
    </div>
  );
};

export default Admin;
