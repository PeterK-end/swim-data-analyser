import FitParser from 'fit-file-parser';
import {renderEditPlot} from './editView.js';

// Declare 'data' as a global variable
let data = null;

// Handle the form submission for file upload
document.getElementById('uploadForm').addEventListener('submit', function(event) {
    event.preventDefault(); // Prevent the default form submission

    const formData = new FormData();
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];

    if (!file) {
        displayFlashMessage('Please select a file to upload.', 'error');
        return;
    }

    formData.append('file', file);

    // New parsing logic using fit-file-parser
    const reader = new FileReader();
    reader.onload = function(event) {
        const arrayBuffer = event.target.result;

        const fitParser = new FitParser({
            force: true,
            speedUnit: 'km/h',
            lengthUnit: 'm',
            temperatureUnit: 'celsius',
            pressureUnit: 'bar',
            elapsedRecordField: true,
            mode: 'both',
        });

        fitParser.parse(arrayBuffer, function (error, parsedData) {
            if (error) {
                console.error('Error parsing FIT file:', error);
            } else {
                sessionStorage.setItem('orginalData', JSON.stringify(parsedData));
                sessionStorage.setItem('modifiedData', JSON.stringify(parsedData));

                // const attributesToRemove = [
                //     'zones_target',
                //     'workout_step',
                //     'workout',
                //     'records',
                //     'file_creator',
                //     'devices',
                //     'device_settings',
                //     'device_infos',
                //     'file_ids',
                //     'events',
                //     'user_profile',
                //     'activity'
                // ];

                // // Create a new object with specified attributes removed
                // const cleanedData = Object.keys(parsedData)
                //       .filter(key => !attributesToRemove.includes(key))
                //       .reduce((obj, key) => {
                //           obj[key] = parsedData[key];
                //           return obj;
                //       }, {});

                // // Create a downloadable JSON file
                // const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(cleanedData));
                // const downloadAnchorNode = document.createElement('a');
                // downloadAnchorNode.setAttribute("href", dataStr);
                // downloadAnchorNode.setAttribute("download", "parsed_data.json");
                // document.body.appendChild(downloadAnchorNode); // required for Firefox
                // downloadAnchorNode.click();
                // downloadAnchorNode.remove();

                const lengthsData = parsedData.lengths;
                renderEditPlot(lengthsData);
            }
        });
    };

    reader.readAsArrayBuffer(file); // Read the file as an ArrayBuffer
});

function displayFlashMessage(message, category) {
    const flashMessage = document.createElement('div');
    flashMessage.className = `flash-message ${category}`;
    flashMessage.textContent = message;

    document.body.appendChild(flashMessage);

    setTimeout(() => {
        flashMessage.remove();
    }, 3000);  // Message disappears after 3 seconds
}

// Fetch default data and render it when the page loads
function loadDefaultData() {

    fetch('/getDefaultData')
        .then(response => response.json())
        .then(data => {

            sessionStorage.setItem('originalData', JSON.stringify(data));
            sessionStorage.setItem('modifiedData', JSON.stringify(data));

            // Assuming your new data structure has multiple blocks like 'lengths'
            if (data.lengths) {
                const lengthData = data.lengths;
                renderEditPlot(lengthData); // Render the plot with the 'lengths' data block
            } else {
                console.error("No 'length' data found in the response");
            }
        })
        .catch(error => {
            console.error('Error fetching default data:', error);
            displayFlashMessage('Error fetching default data.', 'error');
        });
}

document.addEventListener('DOMContentLoaded', function() {
    const modifiedData = sessionStorage.getItem('modifiedData');

    // Check if 'modifiedData' is null or an empty string
    if (!modifiedData || modifiedData === 'null' || modifiedData === '') {
        // Fetch the default data if no file was uploaded
        loadDefaultData();
    } else {
        // Render the plot with the existing 'data'
        try {
            const data = JSON.parse(modifiedData);
            renderEditPlot(data.lengths); // Use existing data if available
        } catch (error) {
            console.error('Error parsing modifiedData:', error);
            loadDefaultData(); // If parsing fails, load default data
        }
    }
});
