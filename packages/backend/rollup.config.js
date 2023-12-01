import typescript from '@rollup/plugin-typescript';
import nodeResolve from '@rollup/plugin-node-resolve';

export default {
  input: 'src/app.ts',
  output: {
    dir: 'build',
    format: 'es',
    preserveModules: true,
  },
  plugins: [
    nodeResolve({
      preferBuiltins: true,
    }),
    typescript(),
  ],
};
