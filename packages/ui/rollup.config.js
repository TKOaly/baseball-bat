import postcss from 'rollup-plugin-postcss';
import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import path from 'path';

export default {
  input: './src/index.ts',
  output: {
    format: 'esm',
    dir: './build',
    sourcemap: true,
    preserveModules: true,
  },
  plugins: [
    commonjs(),
    resolve(),
    typescript({
      exclude: ['src/**/*.stories.tsx'],
    }),
    postcss({
      config: {
        path: './.postcssrc',
      },
      extract: true,
      extensions: ['.css'],
    }),
  ],
  onwarn: (warning, next) => {
    if (warning.code === 'THIS_IS_UNDEFINED') {
      const segments = warning.loc.file.split(path.sep);
      const index = segments.lastIndexOf('node_modules');

      if (index > -1 && index + 1 < segments.length && segments[index+1] === 'remeda') {
        return;
      }
    }

    next(warning);
  },
}
