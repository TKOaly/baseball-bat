import { BusContext } from '@/app';
import opentelemetry, { SpanStatusCode } from '@opentelemetry/api';
import { ExecutionContext } from '@/bus';
import { AckPolicy, JsMsg } from 'nats';
import * as payerService from '@/modules/payers/definitions';
import * as t from 'io-ts';
import { emailIdentity, tkoalyIdentity } from '@bbat/common/types';
import { ModuleDeps } from '@/module';

const messageType = t.type({
  type: t.union([t.literal('set'), t.literal('create'), t.literal('import')]),
  user: t.number,
  fields: t.record(t.string, t.unknown),
});

const handleMessage = async (msg: JsMsg, bus: ExecutionContext<BusContext>) => {
  const payload = msg.json();

  if (!messageType.is(payload)) {
    return;
  }

  const logger = bus.context.logger.child({ memberId: payload.user });

  const handleEmailChange = async (memberId: number, email: string) => {
    logger.info(`Handling email change...`, { email });

    const payerWithMemberId = await bus.exec(
      payerService.getPayerProfileByTkoalyIdentity,
      tkoalyIdentity(memberId),
    );
    const payerWithEmail = await bus.exec(
      payerService.getPayerProfileByEmailIdentity,
      emailIdentity(email),
    );

    if (
      payerWithMemberId &&
      payerWithEmail &&
      payerWithMemberId.id.value !== payerWithEmail.id.value
    ) {
      await bus.exec(payerService.mergeProfiles, {
        primary: payerWithMemberId.id,
        secondary: payerWithEmail.id,
      });
    } else if (payerWithEmail) {
      await bus.exec(payerService.updatePayerMemberId, {
        payerId: payerWithEmail.id,
        memberId: tkoalyIdentity(memberId),
      });
    } else if (payerWithMemberId) {
      await bus.exec(payerService.addPayerEmail, {
        payerId: payerWithMemberId.id,
        email,
        priority: 'default',
        source: 'tkoaly',
      });

      await bus.exec(payerService.updatePayerEmailPriority, {
        payerId: payerWithMemberId.id,
        email: payerWithMemberId.primaryEmail!,
        priority: 'default',
      });

      await bus.exec(payerService.updatePayerEmailPriority, {
        payerId: payerWithMemberId.id,
        email,
        priority: 'primary',
      });
    }

    logger.info(`Email changed!`);

    return payerWithEmail;
  };

  logger.info(`Handling update for member ${payload.user}...`);

  if (
    (payload.type === 'import' || payload.type === 'create') &&
    'email' in payload.fields &&
    typeof payload.fields.email === 'string'
  ) {
    await handleEmailChange(payload.user, payload.fields.email);
  }

  if (
    payload.type === 'set' &&
    'email' in payload.fields &&
    typeof payload.fields.email === 'string'
  ) {
    const payerWithEmail = await handleEmailChange(
      payload.user,
      payload.fields.email,
    );

    const payer = await bus.exec(
      payerService.getPayerProfileByTkoalyIdentity,
      tkoalyIdentity(payload.user),
    );

    if (!payer || payerWithEmail) {
      return;
    }
  }

  if (
    'screen_name' in payload.fields &&
    typeof payload.fields.screen_name === 'string'
  ) {
    logger.info('Handling name change...');

    const payer = await bus.exec(
      payerService.getPayerProfileByTkoalyIdentity,
      tkoalyIdentity(payload.user),
    );

    if (!payer) {
      logger.info(`No matching payer profile.`);
      return;
    }

    logger.info(`Found matching payer profile!`, { payerId: payer.id.value });

    await bus.exec(payerService.updatePayerName, {
      payerId: payer.id,
      name: payload.fields.screen_name,
    });

    logger.info('Payer name updated.');
  }
};

export default async ({ pool, bus, nats, logger }: ModuleDeps) => {
  const jsm = await nats.jetstreamManager();

  await jsm.consumers.add('members', {
    durable_name: 'baseball-bat',
    ack_policy: AckPolicy.Explicit,
    filter_subject: 'members.*',
    // deliver_policy: DeliverPolicy.New,
  });

  const consumer = await nats
    .jetstream()
    .consumers.get('members', 'baseball-bat');

  logger.info('NATS worker started.');

  for await (const msg of await consumer.consume()) {
    const attributes = {
      nats_subject: msg.subject,
      nats_seq: msg.seq,
    };

    const childLogger = logger.child(attributes);

    await pool.tryWithConnection(async pg => {
      const tracer = opentelemetry.trace.getTracer('baseball-bat');

      await tracer.startActiveSpan(
        'nats handler',
        { attributes, root: true },
        async span => {
          const ctx = bus.createContext({
            pg,
            nats,
            span,
            logger: childLogger,
            session: null,
          });
          childLogger.info(
            `Processing NATS message ${msg.seq} with subject '${msg.subject}'.`,
          );
          try {
            await handleMessage(msg, ctx);
          } catch (err) {
            if (err instanceof Error) {
              span.recordException(err);
            }

            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: `${err}`,
            });

            throw err;
          } finally {
            span.end();
          }
        },
      );

      msg.ack();
    });
  }
};
