import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const resolveRoot = (dir: string) => {
  const file = path.join(dir, 'pnpm-workspace.yaml');

  if (fs.existsSync(file)) {
    return dir;
  }

  return resolveRoot(path.dirname(dir));
};

const root = resolveRoot(__dirname);

dotenv.config({ path: path.join(root, '.env') });
