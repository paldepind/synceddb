const webpack = require('webpack');

const isProduction = process.env.NODE_ENV === 'production';
const isAmd = process.env.LIBRARY_TARGET === 'amd';
const outputFileName = `dist/synceddb${isAmd ? '-amd' : '-global'}${isProduction ? '.min' : ''}.js`;

module.exports = {
  entry: ['./synceddb.js'],
  output: {
    path: __dirname,
    filename: outputFileName,
    library: 'syncedDB',
    libraryTarget: isAmd ? 'amd' : 'var'
  },
  module: {
    loaders: [
      {
        test: /\.js$/,
        loader: 'babel',
        exclude: /(node_modules|bower_components)/,
        query: {
          presets: ['es2015'],
          plugins: [ 'transform-remove-console' ],
        },
      },
    ]
  },
  plugins: isProduction ? [
    new webpack.optimize.UglifyJsPlugin({
      compress: { warnings: false }
    })
  ] : []
};
