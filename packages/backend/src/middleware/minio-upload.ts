import busboy from 'busboy';
import { randomUUID } from 'crypto';
import * as Minio from 'minio';
import { Middleware, Response } from 'typera-express';
import { Logger } from 'winston';
import { Transform, TransformCallback } from 'stream';

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
  { minio: Minio.Client; logger: Logger },
  { file: UploadedFile },
  Response.BadRequest
>;

class StreamMeter extends Transform {
  size = 0;

  _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    this.size += chunk.length;
    this.push(chunk);
    callback();
  }
}

function formatBytes(bytes: number, decimals: number = 2) {
  if (bytes == 0) return '0 Bytes';
  const k = 1000;
  const units = ['bytes', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (
    (bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : decimals) + ' ' + units[i]
  );
}

export const uploadToMinio =
  (options: Options): UploadMiddleware =>
  async ({ req, logger: parentLogger, minio }) => {
    const logger = parentLogger.child({
      middleware: 'minio-upload',
    });

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

        const meter = new StreamMeter();

        try {
          await minio.putObject(options.bucket, key, file.pipe(meter));

          logger.info(
            `Uploaded user file ${info.filename} (${formatBytes(meter.size)}) to MinIO as ${options.bucket}/${key}`,
          );

          resolve({
            bucket: options.bucket,
            key,
          });
        } catch (err) {
          logger.error(
            `Failed to upload user file "${info.filename}" to MinIO: ${err}`,
          );
          reject(err);
        }
      });

      bb.on('error', err => {
        logger.error('Failed to parse request body!');
        reject(err);
      });

      req.pipe(bb);
    });

    return Middleware.next({
      file,
    });
  };
