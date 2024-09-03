// flash_message.js

document.addEventListener('DOMContentLoaded', function() {
    const flashMessage = document.getElementById('flash-message');
    if (flashMessage) {
        flashMessage.style.display = 'block'; // Show the message
        setTimeout(() => {
            flashMessage.style.display = 'none'; // Hide after 3 seconds
        }, 3000); // 3000 milliseconds = 3 seconds
    }
});
