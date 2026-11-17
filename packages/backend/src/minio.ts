import { Logger } from '@/logger';
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
      await minio.makeBucket(config.minioBucket);
      logger.info({ bucket: config.minioBucket }, 'Created MinIO bucket');
    }
  } catch (err) {
    logger.error(
      { err, bucket: config.minioBucket },
      'Failed to create MinIO bucket',
    );

    throw err;
  }

  return minio;
};
