const path = require('path');
const { WebpackManifestPlugin } = require('webpack-manifest-plugin');

module.exports = {
    entry: {
        main: './swim_data_analyser/static/js/index.js',
    },
    output: {
        filename: '[name].[contenthash].js',
        path: path.resolve(__dirname, 'swim_data_analyser/static/js/dist'),
        clean: true,
        publicPath: '/static/js/dist/',   // important for manifest + PWA
    },
    mode: 'production',
    plugins: [
        new WebpackManifestPlugin({
            fileName: 'manifest.json',
        })
    ]
};
