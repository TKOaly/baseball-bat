import { Config } from './config';
import * as Minio from 'minio';

export const setupMinio = async (config: Config) => {
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

  if (!(await minio.bucketExists(config.minioBucket))) {
    await minio.makeBucket(config.minioBucket);
  }

  return minio;
};
