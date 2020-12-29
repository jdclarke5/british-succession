import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';
import copy from 'rollup-plugin-copy';
import html from '@open-wc/rollup-plugin-html';

const production = !process.env.ROLLUP_WATCH;

export default {
  input: 'index.html',
  output: {
    dir: 'build',
    name: 'bundle',
    minify: production && true, // minify, but only in production
    format: 'iife',
    sourcemap: false,
  },
  plugins: [
    copy({targets: [{src: 'static', dest: 'build'}, {src: 'favicon.ico', dest: 'build'}]}),
    html(),
    resolve(), // tells Rollup how to find date-fns in node_modules
    commonjs(), // converts date-fns to ES modules
    production && terser(), // minify, but only in production
  ]
};
