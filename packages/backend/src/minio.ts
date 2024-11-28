import { Logger } from 'winston';
import { Config } from './config';
import * as Minio from 'minio';

export const setupMinio = async (config: Config, logger: Logger) => {
  const minioUrl = new URL(config.minioUrl);

  const endPoint = minioUrl.hostname;
  const port = parseInt(minioUrl.port, 10);
  const useSSL = minioUrl.protocol === 'https:';

  const minio = new Minio.Client({
    endPoint,
    port,
    useSSL,
    accessKey: config.minioAccessKey,
    secretKey: config.minioSecretKey,
  });

  try {
    if (!(await minio.bucketExists(config.minioBucket))) {
      logger.info(`Created MinIO bucket: ${config.minioBucket}`);
      await minio.makeBucket(config.minioBucket);
    }
  } catch (err) {
    logger.error('Failed to create MinIO bucket: ' + err);

    throw err;
  }

  return minio;
};
