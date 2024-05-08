import { RouterFactory } from "@/module";
import auth from '@/auth-middleware';
import { router, Parser } from "typera-express";
import { paginationQuery } from "@bbat/common/types";
import * as defs from './definitions';
import { ok } from "typera-express/response";

const factory: RouterFactory = (route) => {

  const getAuditLogEvents = route
    .use(auth())
    .use(Parser.query(paginationQuery))
    .get('/events')
    .handler(async ({ bus, query }) => {
      const results = await bus.exec(defs.getLogEvents, {
        ...query,
      });

      return ok(results);
    });

  return router(getAuditLogEvents);
};

export default factory;
