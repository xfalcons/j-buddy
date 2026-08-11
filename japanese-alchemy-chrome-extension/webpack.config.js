const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

function transformManifest(content, isDevelopment) {
  const manifest = JSON.parse(content.toString());
  manifest.background.service_worker = 'scripts/background.bundle.js';
  manifest.content_scripts[0].js = ['scripts/contentScript.bundle.js'];
  manifest.side_panel.default_path = 'sidepanel.html';

  if (isDevelopment) {
    manifest.host_permissions = ['http://127.0.0.1/*'];
  }

  return JSON.stringify(manifest, null, 2);
}

function createWebpackConfig(_env, argv = {}) {
  const isDevelopment = argv.mode === 'development';

  return {
    entry: {
      background: './src/scripts/background.js',
      contentScript: './src/scripts/contentScript.js',
      firebaseConfig: './src/scripts/firebaseConfig.js',
      authService: './src/scripts/authService.js',
      jaAlchemyApiService: './src/scripts/jaAlchemyApiService.js',
      sidepanel: ['./src/sidepanel/sidepanel.js'],
      offscreen: './src/offscreen/offscreen.js',
    },
    output: {
      filename: 'scripts/[name].bundle.js',
      path: path.resolve(__dirname, 'dist'),
      clean: true,
    },
    devtool: isDevelopment ? 'source-map' : false,
    module: {
      rules: [
        {
          test: /\.css$/,
          use: [
            MiniCssExtractPlugin.loader,
            'css-loader'
          ],
        },
      ],
    },
    optimization: {
      minimize: true,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            compress: {
              unsafe: false,
              unsafe_arrows: false,
              unsafe_methods: false,
            },
            mangle: {
              keep_classnames: true,
              keep_fnames: true,
            },
            format: {
              comments: false,
            },
            ecma: 2020,
            safari10: true,
          },
          extractComments: false,
        }),
        new CssMinimizerPlugin(),
      ],
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: 'styles/[name].[contenthash].css',
      }),
      new HtmlWebpackPlugin({
        template: './src/sidepanel/sidepanel.html',
        filename: 'sidepanel.html',
        chunks: ['firebaseConfig', 'authService', 'sidepanel', 'jaAlchemyApiService'],
        inject: true
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: './src/manifest.json',
            to: 'manifest.json',
            transform(content) {
              return transformManifest(content, isDevelopment);
            },
          },
          {
            from: './src/images',
            to: 'images',
          },
          {
            from: './src/scripts/bootstrap.bundle.min.js',
            to: 'scripts/bootstrap.bundle.min.js',
          },
          {
            from: './src/offscreen/offscreen.html',
            to: 'offscreen/offscreen.html',
          },
          {
            from: './src/offscreen/offscreen.js',
            to: 'scripts/offscreen.js',
          },
          // {
          //   from: './src/scripts/jaAlchemyApiService.js',
          //   to: 'scripts/jaAlchemyApiService.js',
          // },
        ],
      }),
    ],
  };
}

createWebpackConfig.transformManifest = transformManifest;

module.exports = createWebpackConfig;
