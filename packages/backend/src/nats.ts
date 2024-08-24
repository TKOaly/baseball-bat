import { connect as connectNats } from "nats";
import { Config } from "./config";

export const setupNats = async (config: Config) => {
  const nats = await connectNats({
    servers: [`${config.natsHost}:${config.natsPort}`],
    user: config.natsUser,
    pass: config.natsPassword,
  });

  return nats;
}
