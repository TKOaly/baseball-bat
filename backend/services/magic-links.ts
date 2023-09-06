import { Inject, Service } from 'typedi';
import { internalIdentity, InternalIdentity } from '../../common/types';
import { Config } from '../config';
import * as crypto from 'crypto';
import { RedisClientType } from 'redis';
import * as E from 'fp-ts/lib/Either';
import * as t from 'io-ts';
import { pipe } from 'fp-ts/lib/function';
import * as O from 'fp-ts/lib/Option';

const magicLinkPayload = t.intersection([
  t.type({
    path: t.string,
    created: t.number,
    ttl: t.number,
    oneTime: t.boolean,
    authenticate: t.boolean,
  }),
  t.partial({
    email: t.string,
    profileId: t.string,
  }),
]);

export type MagicLinkPayload = t.TypeOf<typeof magicLinkPayload>;

export type MagicLinkOptions = {
  path: string;
  authenticate?: boolean;
  email?: string;
  profileId?: InternalIdentity;
  ttl?: number;
  oneTime?: boolean;
};

export type MagicLink = {
  payload: Omit<MagicLinkPayload, 'profileId'> & {
    profileId?: InternalIdentity;
  };
  hash: string;
};

@Service()
export class MagicLinkService {
  @Inject(() => Config)
  config: Config;

  @Inject('redis')
  redis: RedisClientType;

  getKey() {
    const hash = crypto.createHash('sha256');
    hash.update(this.config.magicLinkSecret);
    return hash.digest();
  }

  async createMagicLink(options: MagicLinkOptions) {
    const key = this.getKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes256', key, iv);

    const payload = {
      ...options,
      ttl: options.ttl ?? 60 * 60,
      created: Date.now(),
    };

    const payload_buf = Buffer.from(JSON.stringify(payload), 'utf8');

    const chipertext = Buffer.concat([
      cipher.update(payload_buf),
      cipher.final(),
    ]);

    const link_data = Buffer.concat([iv, Buffer.from(chipertext)]);
    const link_text = link_data.toString('base64url');

    const hash = crypto.createHash('sha256');
    hash.update(payload_buf);

    const link_hash = hash.digest('hex');

    if (options.oneTime) {
      const key = 'magic-link:' + link_hash + ':valid';
      console.log(key);
      await this.redis.set('magic-link:' + link_hash + ':valid', 'true');
    }

    return `${this.config.appUrl}/magic/${link_text}`;
  }

  decodeMagicLink(payload: string): O.Option<MagicLink> {
    const payload_buf = Buffer.from(payload, 'base64url');

    if (payload_buf.length % 16 !== 0) {
      return O.none;
    }

    const iv_buf = Buffer.alloc(16);
    const chipertext_buf = Buffer.alloc(payload_buf.length - 16);
    payload_buf.copy(iv_buf, 0, 0, 16);
    payload_buf.copy(chipertext_buf, 0, 16);

    const key = this.getKey();

    const decipher = crypto.createDecipheriv('aes256', key, iv_buf);

    const data_buf = Buffer.concat([
      decipher.update(chipertext_buf),
      decipher.final(),
    ]);

    const hasher = crypto.createHash('sha256');
    hasher.update(data_buf);
    const hash = hasher.digest('hex');

    const data_str = data_buf.toString('utf8');

    console.log(JSON.parse(data_str));

    return pipe(
      JSON.parse(data_str),
      magicLinkPayload.decode,
      E.fold(
        () => O.none,
        payload =>
          O.some({
            payload: {
              ...payload,
              profileId:
                payload.profileId === undefined
                  ? undefined
                  : internalIdentity(payload.profileId),
            },
            hash,
          }),
      ),
    );
  }

  async validateMagicLink({ payload, hash }: MagicLink) {
    if (Date.now() > (payload.created + payload.ttl) * 1000) {
      return false;
    }

    if (payload.oneTime) {
      const key = `magic-link:${hash}:valid`;
      const result = await this.redis.del(key);

      console.log(key, result);

      if (result === 0) {
        return false;
      }
    }

    return true;
  }
}
