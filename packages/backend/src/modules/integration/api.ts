import { RouterFactory } from '@/module';
import { Parser, Response, Middleware, router } from 'typera-express';
import * as debtService from '@/modules/debts/definitions';
import * as payerService from '@/modules/payers/definitions';
import * as bankingService from '@/modules/banking/definitions';
import * as A from 'fp-ts/Array';
import * as T from 'fp-ts/Task';
import * as D from 'fp-ts/Date';
import * as O from 'fp-ts/Option';
import {
  internalServerError,
  notFound,
  ok,
  unauthorized,
} from 'typera-express/response';
import { paginationQuery } from '@bbat/common/types';
import { flow } from 'fp-ts/function';

type AuthServiceMiddleware = Middleware.ChainedMiddleware<
  { isServiceRequest: boolean },
  Record<string, never>,
  Response.Unauthorized | Response.BadRequest
>;

const routes: RouterFactory = route => {
  const authService: AuthServiceMiddleware = async ({ isServiceRequest }) => {
    if (!isServiceRequest) {
      return Middleware.stop(unauthorized());
    }

    return Middleware.next({});
  };

  const getDebtsByMembersId = route
    .get('/debts/by-member-id/:id(int)')
    .use(authService)
    .use(Parser.query(paginationQuery))
    .handler(async ({ bus, query, routeParams }) => {
      const debts = await bus.exec(debtService.getDebtsByPayerMemberId, {
        memberId: routeParams.id,
        cursor: query.cursor,
        limit: query.limit,
        sort: query.sort,
      });

      return ok(debts);
    });

  const getDebt = route
    .get('/debts/:id')
    .use(authService)
    .handler(async ({ bus, routeParams }) => {
      const debt = await bus.exec(debtService.getDebt, routeParams.id);

      if (!debt) {
        return notFound({});
      }

      const payer = await bus.exec(
        payerService.getPayerProfileByInternalIdentity,
        debt.payerId,
      );

      if (!payer) {
        return internalServerError({});
      }

      return ok({
        payerId: debt.payerId,
        tkoalyUserId: payer.tkoalyUserId,
      });
    });

  const getBankingInfo = route
    .get('/banking-info')
    .use(authService)
    .handler(({ bus }) =>
      flow(
        bus.execT(bankingService.getBankAccounts),
        T.chain(
          A.traverse(T.ApplicativePar)(
            flow(
              ({ iban }) => iban,
              bus.execT(bankingService.getAccountStatements),
            ),
          ),
        ),
        T.map(
          flow(
            A.flatten,
            A.map(statement => statement.closingBalance.date),
            A.sort(D.Ord),
            A.last,
            O.toNullable,
            latest =>
              ok({
                latestBankInfo: latest,
              }),
          ),
        ),
      )()(),
    );

  return router(getDebtsByMembersId, getDebt, getBankingInfo);
};

export default routes;
