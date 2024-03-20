import { router } from 'typera-express';
import auth from '@/auth-middleware';
import { ApiFactory } from '.';
import {
  createDebtCenter,
  getDebtCenterByName,
} from '@/modules/debt-centers/definitions';
import { format, getYear, subDays } from 'date-fns';
import { internalServerError, ok } from 'typera-common/response';
import {
  createDebt as createDebtProc,
  createDebtComponent,
  getDebtComponentsByCenter,
  publishDebt,
  getDebtsByPayer,
  creditDebt,
} from '@/modules/debts/definitions';
import { euro } from '@bbat/common/currency';
import { getPayerProfileByInternalIdentity } from '@/modules/payers/definitions';
import * as TE from 'fp-ts/TaskEither';
import * as A from 'fp-ts/Array';
import { flow, pipe } from 'fp-ts/function';

const factory: ApiFactory = (_, route) => {
  if (process.env.NODE_ENV !== 'development') {
    return router();
  }

  const createDebt = route
    .use(auth())
    .post('/create-debt')
    .handler(async ({ bus, session }) => {
      let center = await bus.exec(getDebtCenterByName, 'Test Center');
      let component;

      const payer = await bus.exec(
        getPayerProfileByInternalIdentity,
        session.payerId,
      );

      if (!payer) {
        return internalServerError();
      }

      if (!center) {
        center = await bus.exec(createDebtCenter, {
          name: 'Test Center',
          accountingPeriod: getYear(new Date()),
          description: '',
          url: '',
        });

        if (!center) {
          console.error('Failed to create debt center!');
          return internalServerError();
        }

        component = await bus.exec(createDebtComponent, {
          name: 'Test Component',
          description: '',
          amount: euro(10),
          debtCenterId: center.id,
        });
      } else {
        [component] = await bus.exec(getDebtComponentsByCenter, center.id);
      }

      if (!component) {
        console.error('Failed to create debt component!');
        return internalServerError();
      }

      const debt = await bus.exec(createDebtProc, {
        debt: {
          name: 'Test Debt',
          description: 'Test Debt Message',
          dueDate: format(subDays(new Date(), 1), 'yyyy-MM-dd') as any,
          components: [component.id],
          centerId: center.id,
          payer: payer.id,
          tags: [],
          accountingPeriod: getYear(new Date()) as any,
        },
      });

      await bus.exec(publishDebt, debt.id);

      return ok({
        debt,
      });
    });

  const creditAll = route
    .use(auth())
    .post('/credit-all')
    .handler(({ bus, session }) =>
      pipe(
        TE.Do,
        TE.bind('debts', () =>
          bus.execTE(getDebtsByPayer)({
            id: session.payerId,
            includeDrafts: false,
            includeCredited: false,
          }),
        ),
        TE.chain(
          flow(
            ({ debts }) => debts.result,
            A.traverse(TE.ApplicativePar)(
              flow(debt => debt.id, bus.execTE(creditDebt)),
            ),
          ),
        ),
        TE.matchW(internalServerError, () => ok()),
      )(),
    );

  return router(createDebt, creditAll);
};

export default factory;
