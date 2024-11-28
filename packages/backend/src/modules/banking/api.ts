import { Parser, router } from 'typera-express';
import { badRequest, notFound, ok } from 'typera-express/response';
import { bankAccount, paginationQuery } from '@bbat/common/build/src/types';
import * as A from 'fp-ts/Array';
import * as T from 'fp-ts/Task';
import * as D from 'fp-ts/Date';
import * as O from 'fp-ts/Option';
import * as bankingService from '@/modules/banking/definitions';
import * as jobs from '@/modules/jobs/definitions';
import { validateBody } from '@/validate-middleware';
import auth from '@/auth-middleware';
import { RouterFactory } from '@/module';
import { flow } from 'fp-ts/lib/function';
import { randomUUID } from 'crypto';
import { uploadToMinio } from '@/middleware/minio-upload';

const factory: RouterFactory = (route, { config }) => {
  const getInfo = route
    .get('/info')
    .use(auth({ accessLevel: 'normal' }))
    .handler(async ({ bus }) => {
      return flow(
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
      )()();
    });

  const getBankAccounts = route
    .get('/accounts')
    .use(auth())
    .handler(async ({ bus }) => {
      const accounts = await bus.exec(bankingService.getBankAccounts);
      return ok(accounts);
    });

  const createBankAccount = route
    .post('/accounts')
    .use(auth())
    .use(validateBody(bankAccount))
    .handler(async ({ bus, body }) => {
      const account = await bus.exec(bankingService.createBankAccount, body);
      return ok(account);
    });

  const getBankAccount = route
    .get('/accounts/:iban')
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      const account = await bus.exec(
        bankingService.getBankAccount,
        ctx.routeParams.iban,
      );
      return ok(account);
    });

  const getBankAccountStatements = route
    .get('/accounts/:iban/statements')
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      const statements = await bus.exec(
        bankingService.getAccountStatements,
        ctx.routeParams.iban,
      );
      return ok(statements);
    });

  const createBankStatement = route
    .post('/statements')
    .use(auth())
    .use(
      uploadToMinio({
        field: 'statement',
        bucket: 'baseball-bat',
        key: () => `statements/${randomUUID()}`,
      }),
    )
    .handler(async ({ bus, ...ctx }) => {
      if (!ctx.file) {
        return badRequest('File `statement` required.');
      }

      const job = await bus.exec(jobs.create, {
        type: 'import-statement',
        data: ctx.file,
        title: 'Import CAMT statement',
        retries: 0,
      });

      return ok({ job });
    });

  const getAccountTransactions = route
    .get('/accounts/:iban/transactions')
    .use(auth())
    .use(Parser.query(paginationQuery))
    .handler(async ({ bus, query, ...ctx }) => {
      const transactions = await bus.exec(
        bankingService.getAccountTransactions,
        {
          iban: ctx.routeParams.iban,
          cursor: query.cursor,
          sort: query.sort,
          limit: query.limit,
        },
      );

      return ok(transactions);
    });

  const getBankStatement = route
    .get('/statements/:id')
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      const statement = await bus.exec(
        bankingService.getBankStatement,
        ctx.routeParams.id,
      );

      return ok(statement);
    });

  const getBankStatementLink = route
    .get('/statements/:id/link')
    .use(auth())
    .handler(async ({ minio, routeParams: { id } }) => {
      try {
        await minio.statObject('baseball-bat', `statements/${id}`);
      } catch {
        return notFound();
      }

      const url = new URL(
        await minio.presignedGetObject(
          'baseball-bat',
          `statements/${id}`,
          5 * 60,
        ),
      );

      if (config.minioPublicUrl !== config.minioUrl) {
        const publicUrl = new URL(config.minioPublicUrl);

        url.host = publicUrl.host;
        url.protocol = publicUrl.protocol;
        url.port = publicUrl.port;
      }

      return ok({
        url: url.toString(),
      });
    });

  const getBankStatementTransactions = route
    .get('/statements/:id/transactions')
    .use(auth())
    .use(Parser.query(paginationQuery))
    .handler(async ({ bus, query: { cursor, limit, sort }, ...ctx }) => {
      const transactions = await bus.exec(
        bankingService.getBankStatementTransactions,
        {
          id: ctx.routeParams.id,
          cursor,
          limit,
          sort,
        },
      );

      return ok(transactions);
    });

  const autoregisterTransactions = route
    .post('/autoregister')
    .use(auth())
    .handler(async () => {
      /*
      const transactions = await bus.exec(
        bankingService.getTransactionsWithoutRegistration,
      );

      for (const transaction of transactions) {
        await bus.exec(paymentService.createPaymentEventFromTransaction, {
          transaction,
          amount: null,
          paymentId: null,
        });
      }*/

      return ok();
    });

  const getTransactionRegistrations = route
    .get('/transactions/:id/registrations')
    .use(auth())
    .handler(async ({ bus, ...ctx }) => {
      const events = await bus.exec(
        bankingService.getTransactionRegistrations,
        ctx.routeParams.id,
      );
      return ok(events);
    });

  return router(
    getBankAccounts,
    createBankAccount,
    getBankAccount,
    createBankStatement,
    getAccountTransactions,
    getBankAccountStatements,
    getBankStatement,
    getBankStatementTransactions,
    autoregisterTransactions,
    getTransactionRegistrations,
    getInfo,
    getBankStatementLink,
  );
};

export default factory;
