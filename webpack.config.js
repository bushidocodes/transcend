const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: './browser/react/index.js',
  output: {
    path: __dirname,
    filename: './public/bundle.js'
  },
  context: __dirname,
  devtool: 'source-map',
  resolve: {
    // axios 1.x browser/cjs build uses ES2020+ syntax; webpack 1's acorn can't parse it.
    // Point to the pre-transpiled UMD bundle instead.
    alias: {
      axios: path.resolve(__dirname, 'node_modules/axios/dist/axios.js')
    },
    extensions: ['', '.js', '.jsx']
  },
  module: {
    loaders: [
      {
        test: /jsx?$/,
        exclude: /(node_modules|bower_components)/,
        loader: 'babel',
        query: {
          presets: ['react', 'es2015', 'stage-2'],
          plugins: ['syntax-decorators', 'transform-decorators-legacy']
        }
      }
    ]
  }
};
