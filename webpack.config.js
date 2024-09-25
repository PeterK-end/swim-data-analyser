const path = require('path');

module.exports = {
    entry: './app/static/js/index.js', // Entry point for your JavaScript
    output: {
        filename: 'main.js', // Output bundled file name
        path: path.resolve(__dirname, 'app/static/js/dist'), // Output directory
    },
    mode: 'development',
};
