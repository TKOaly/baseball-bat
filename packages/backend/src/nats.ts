import { connect as connectNats } from 'nats';
import { Config } from './config';

export const setupNats = async (config: Config) => {
  const nats = await connectNats({
    servers: [`${config.nats.host}:${config.nats.port}`],
    user: config.nats.user,
    pass: config.nats.password,
  });

  const jsm = await nats.jetstreamManager();

  await jsm.streams.add({
    name: 'bbat',
    subjects: ['bbat.>'],
  });

  return nats;
};
