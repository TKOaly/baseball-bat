import { RouterFactory } from '@/module';
import { Parser, Response, Middleware, router } from 'typera-express';
import * as debtService from '@/modules/debts/definitions';
import * as payerService from '@/modules/payers/definitions';
import {
  internalServerError,
  notFound,
  ok,
  unauthorized,
} from 'typera-express/response';
import { paginationQuery } from '@bbat/common/types';

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

  return router(getDebtsByMembersId, getDebt);
};

export default routes;
