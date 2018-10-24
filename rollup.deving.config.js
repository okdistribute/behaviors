import * as path from 'path';

const { behaviorDir, wrappers } = require('./src/buildInfo');

const behavior = 'slideShare';

console.log(behaviorDir)
console.log(path.join(behaviorDir, `${behavior}.js`))

export default {
  input: path.join(behaviorDir, `${behavior}.js`),
  output: {
    file: path.join('dist', `${behavior}.js`),
    sourcemap: false,
    format: 'es',
    exports: 'none'
  },
  watch: { chokidar: true },
  plugins: [{
    ...wrappers.setup,
  }]
};