console.log('upload.js loaded');
document.getElementById('uploadForm').addEventListener('submit', function(event) {
    event.preventDefault(); // Prevent the default form submission

    const formData = new FormData();
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    formData.append('file', file);

    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            displayFlashMessage(data.error, 'error');
        } else {
            displayFlashMessage('File successfully uploaded and parsed!', 'success');
            renderPlot(data);  // Use the returned JSON data to render the plot
        }
    })
    .catch(error => {
        console.error('Error:', error);
        displayFlashMessage('An error occurred during file upload.', 'error');
    });
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
