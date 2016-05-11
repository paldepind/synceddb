const Path = require('path');

module.exports = {
  entry: {
    main: Path.join(__dirname, './main.test')
  },
  output: {
    path: Path.resolve(__dirname, '../dist'),
    filename: '[name].test-bundled.js'
  },
  module: {
    loaders: [
      {
        test: /\.js$/,
        loader: 'babel',
        exclude: /(node_modules|bower_components)/,
        query: {
          presets: ['es2015']
        }
      },
    ]
  },
};

