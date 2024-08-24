import { BusContext } from '@/app';
import { Bus, ExecutionContext } from '@/bus';
import { Config } from '@/config';
import { AckPolicy, JsMsg, NatsConnection } from 'nats';
import { Pool } from '@/db/connection';
import * as payerService from '@/modules/payers/definitions';
import * as t from 'io-ts';
import { emailIdentity, tkoalyIdentity } from '@bbat/common/types';

const messageType = t.type({
  type: t.union([
    t.literal('set'),
    t.literal('create'),
    t.literal('import'),
  ]),
  user: t.number,
  fields: t.record(t.string, t.unknown),
});

const handleMessage = async (msg: JsMsg, bus: ExecutionContext<BusContext>) => {
  const payload = msg.json();

  console.log('Got message', msg.seq);

  if (!messageType.is(payload)) {
    return;
  }

  const handleEmailChange = async (memberId: number, email: string) => {
    const payerWithMemberId = await bus.exec(payerService.getPayerProfileByTkoalyIdentity, tkoalyIdentity(memberId));
    const payerWithEmail = await bus.exec(payerService.getPayerProfileByEmailIdentity, emailIdentity(email));

    if (payerWithMemberId && payerWithEmail && payerWithMemberId.id.value !== payerWithEmail.id.value) {
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
        payerId:payerWithMemberId.id,
        email,
        priority: 'primary',
      });
    }

    return payerWithEmail;
  };

  if ((payload.type === 'import' || payload.type === 'create') && 'email' in payload.fields && typeof payload.fields.email === 'string') {
    await handleEmailChange(payload.user, payload.fields.email);
  }

  if (payload.type === 'set' && 'email' in payload.fields && typeof payload.fields.email === 'string') {
    const payerWithEmail = await handleEmailChange(payload.user, payload.fields.email);

    const payer = await bus.exec(payerService.getPayerProfileByTkoalyIdentity, tkoalyIdentity(payload.user));

    console.log('Email:', !!payerWithEmail);

    if (!payer || payerWithEmail) {
      return;
    }

    try {
    } catch (err) {
      console.log(`Failed to update email ${payload.fields.email} for payer ${payer.name} (${payer.id.value})!`);
      console.error(err);
    }
  }

  if ('screen_name' in payload.fields && typeof payload.fields.screen_name === 'string') {
    const payer = await bus.exec(payerService.getPayerProfileByTkoalyIdentity, tkoalyIdentity(payload.user));

    if (!payer) {
      return;
    }

    await bus.exec(payerService.updatePayerName, {
      payerId: payer.id,
      name: payload.fields.screen_name,
    });
  }
};

export default async (pool: Pool, bus: Bus<BusContext>, config: Config, nats: NatsConnection) => {
  const jsm = await nats.jetstreamManager();

  await jsm.consumers.add('members', {
    durable_name: 'baseball-bat',
    ack_policy: AckPolicy.Explicit,
    filter_subject: 'members.*',
    // deliver_policy: DeliverPolicy.New,
  });

  const consumer = await nats.jetstream()
    .consumers
    .get('members', 'baseball-bat');

  for await (const msg of await consumer.consume()) {
    await pool.tryWithConnection(async pg => {
      const ctx = bus.createContext({ pg, nats, session: null });
      await handleMessage(msg, ctx);
      msg.ack();
    });
  }
};
