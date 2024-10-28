const path = require('path');

module.exports = {
    entry: './swim_data_analyser/static/js/index.js', // Entry point for your JavaScript
    output: {
        filename: 'main.js', // Output bundled file name
        path: path.resolve(__dirname, 'swim_data_analyser/static/js/dist'), // Output directory
    },
    mode: 'development',
};
