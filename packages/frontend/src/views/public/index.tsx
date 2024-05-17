import { MouseEventHandler, PropsWithChildren } from 'react';
import { Lock } from 'react-feather';
import { Link, Redirect, Route, Switch, useLocation, useRoute } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useDeauthenticate, useSession } from '../../hooks/use-session';
import { Debts } from './debts';
import { Settings } from './settings';
import { DebtDetails } from './debt-details';
import { NewPayment } from './new-payment';
import { PaymentDetails } from './payment-details';
import { StripePaymentFlow } from './stripe-payment-flow';
import { StripePaymentReturnPage } from './stripe-payment-return-page';
import { cva } from 'class-variance-authority';

const menuItemCva = cva('h-10 flex items-center px-4 rounded-md border-2', {
  variants: {
    type: {
      primary: 'border-transparent',
      secondary: 'border-white/20 text-zinc-50',
    },
    active: {
      true: '',
      false: '',
    },
  },
  compoundVariants: [
    {
      type: 'primary',
      active: false,
      class: 'bg-white/20 text-zinc-50',
    },
    {
      type: 'primary',
      active: true,
      class: 'bg-white/80 text-zinc-800',
    },
  ],
});

const MenuItem = ({
  children,
  secondary,
  ...props
}: PropsWithChildren<{
  secondary?: boolean;
  to?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}>) => {
  const [route] = useRoute(`${props.to}/*?`);

  return (
    <li>
      <Link
        to={props.to ?? '#'}
        onClick={props.onClick}
        className={menuItemCva({
          type: secondary ? 'secondary' : 'primary',
          active: !!route,
        })}
      >
        {children}
      </Link>
    </li>
  );
};

export const PublicSite = () => {
  const { t, i18n } = useTranslation();
  const [, navigate] = useLocation();
  const session = useSession();
  const deauthenticate = useDeauthenticate();

  const handleLogOut = async () => {
    await deauthenticate();
    navigate('/');
  };

  return (
    <div className="gradient-background relative z-0 min-h-screen w-screen justify-center gap-5 overflow-hidden bg-gray-100 px-4 pb-10 pt-10 md:pt-20">
      <div className="flex grid-cols-1 flex-col items-center justify-center gap-5">
        <h1 className="font-dm-serif text-center text-3xl font-extrabold text-zinc-100 drop-shadow-xl md:col-span-3 md:mb-5 md:block md:text-5xl">
          Baseball Bat
        </h1>
        <ul className="mb-5 flex flex-wrap justify-center gap-5 md:mt-8">
          <MenuItem to="/debts">{t('navigation.payments')}</MenuItem>
          {/* <MenuItem to="/settings">{t('navigation.settings')}</MenuItem> */}
          {session.data?.accessLevel === 'admin' && (
            <MenuItem to="/admin/debt-centers">
              {t('navigation.administration')} <Lock className="ml-2 size-4" />
            </MenuItem>
          )}
          <MenuItem onClick={handleLogOut}>{t('navigation.logOut')}</MenuItem>
          {i18n.language === 'en' && (
            <MenuItem
              secondary
              to="#"
              onClick={() => i18n.changeLanguage('fi')}
            >
              Suomeksi
            </MenuItem>
          )}
          {i18n.language === 'fi' && (
            <MenuItem
              secondary
              to="#"
              onClick={() => i18n.changeLanguage('en')}
            >
              In English
            </MenuItem>
          )}
        </ul>
        <div className="mx-3 flex w-full max-w-[50em] flex-col items-stretch">
          <Switch>
            <Route path="/debts" component={Debts} />
            <Route path="/debts/:id" component={DebtDetails} />
            <Route path="/debts/:id/pay" component={NewPayment} />
            <Route path="/settings" component={Settings} />
            <Route path="/payments/new" component={NewPayment} />
            <Route path="/payments/:id" component={PaymentDetails} />
            <Route
              path="/payments/:id/stripe/:secret"
              component={StripePaymentFlow}
            />
            <Route
              path="/payment-completed"
              component={StripePaymentReturnPage}
            />
            <Route>
              <Redirect to="/debts" />
            </Route>
          </Switch>
        </div>
      </div>
    </div>
  );
};
