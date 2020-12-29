import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';
import copy from 'rollup-plugin-copy';
const htmlPlugin = require('rollup-plugin-html-input');

const production = !process.env.ROLLUP_WATCH;

export default {
  input: 'index.html',
  output: {
    file: 'build/bundle.js',
    format: 'iife', // immediately-invoked function expression — suitable for <script> tags
    sourcemap: false
  },
  plugins: [
    copy({targets: [{src: 'static', dest: 'build'}, {src: 'favicon.ico', dest: 'build'}]}),
    htmlPlugin(),
    resolve(), // tells Rollup how to find date-fns in node_modules
    commonjs(), // converts date-fns to ES modules
    production && terser() // minify, but only in production
  ]
};
