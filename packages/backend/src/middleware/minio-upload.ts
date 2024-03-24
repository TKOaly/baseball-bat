import busboy from 'busboy';
import { randomUUID } from 'crypto';
import * as Minio from 'minio';
import { Middleware, Response } from 'typera-express';

export type Options = {
  field: string;
  bucket: string;
  prefix?: string;
  key?: string | ((file: busboy.FileInfo) => string);
};

export type UploadedFile = {
  bucket: string;
  key: string;
};

export type UploadMiddleware = Middleware.ChainedMiddleware<
  { minio: Minio.Client },
  { file: UploadedFile },
  Response.BadRequest
>;

export const uploadToMinio =
  (options: Options): UploadMiddleware =>
  async ({ req, minio }) => {
    const file = await new Promise<UploadedFile>((resolve, reject) => {
      const bb = busboy({ headers: req.headers });

      bb.on('file', async (fieldname, file, info) => {
        if (fieldname !== options.field) {
          return;
        }

        let key: string = randomUUID();

        if (typeof options.key === 'string') {
          key = options.key;
        } else if (typeof options.key === 'function') {
          key = options.key(info);
        }

        await minio.putObject(options.bucket, key, file);

        resolve({
          bucket: options.bucket,
          key,
        });
      });

      bb.on('error', err => {
        console.error(err);
        reject('Failed to upload file!');
      });

      req.pipe(bb);
    });

    return Middleware.next({
      file,
    });
  };
