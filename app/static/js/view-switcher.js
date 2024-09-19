// JavaScript to handle view switching
document.addEventListener('DOMContentLoaded', function () {
  const editView = document.getElementById('editView');
  const analyseView = document.getElementById('analyseView');
  const editContent = document.getElementById('editContent');
  const analyseContent = document.getElementById('analyseContent');

  // Function to switch views
  function switchView(view) {
    if (view === 'edit') {
      editContent.style.display = 'block';
      analyseContent.style.display = 'none';
      editView.classList.add('highlighted');
      analyseView.classList.remove('highlighted');
    } else if (view === 'analyse') {
      editContent.style.display = 'none';
      analyseContent.style.display = 'block';
      analyseView.classList.add('highlighted');
      editView.classList.remove('highlighted');
    }
  }

  // Event listeners for icon clicks
  editView.addEventListener('click', function () {
    switchView('edit');
  });

  analyseView.addEventListener('click', function () {
    switchView('analyse');
  });

  // Default to edit view on page load
  switchView('edit');
});
