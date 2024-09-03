from flask import Blueprint, render_template, jsonify, request, redirect, url_for, flash
from werkzeug.utils import secure_filename
import fitdecode
import os

main = Blueprint('main', __name__)

session = {}

# Define where to save uploaded files
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'fit'}

# Ensure the upload folder exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Sample data
data = [
    {"label": "A", "value": 10},
    {"label": "B", "value": 15},
    {"label": "C", "value": 20}
]

def get_user_upload_folder():
    user_id = session.get('user_id', 'guest')
    user_folder = os.path.join(UPLOAD_FOLDER, user_id)
    os.makedirs(user_folder, exist_ok=True)
    return user_folder
@main.route('/')
def index():
    return render_template('index.html', data=data)

@main.route('/merge', methods=['POST'])
def merge():
    global data
    labels_to_merge = request.json['labels']

    # Simple merge logic
    new_value = sum(item['value'] for item in data if item['label'] in labels_to_merge)
    data = [item for item in data if item['label'] not in labels_to_merge]
    data.append({"label": "+".join(labels_to_merge), "value": new_value})

    return jsonify(data)

@main.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        flash('No file part')
        return redirect(url_for('main.index'))
    file = request.files['file']
    if file.filename == '':
        flash('No selected file')
        return redirect(url_for('main.index'))

    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        user_folder = get_user_upload_folder()
        file_path = os.path.join(user_folder, filename)
        # TODO: agree upon useful file handling -> data base?
        file.save(file_path)
        parsed_content = parse_fit_file(file_path)
        session['parsed_data'] = parsed_content
        flash('File successfully uploaded')
        return redirect(url_for('main.view_parsed_data'))
#        return redirect(url_for('main.parse_fit', filename=file.filename))

    else:
        flash('Only .fit files are allowed for upload.')
        return redirect(url_for('main.index'))

# For Testing purposes only !!!

@main.route('/view_parsed_data')
def view_parsed_data():
    parsed_data = session.get('parsed_data')
    if parsed_data is None:
        flash('No data to display.', 'error')
        return redirect(url_for('main.index'))
    return render_template('view_parsed_data.html', parsed_data=parsed_data)

@main.route('/edit_data', methods=['POST'])
def edit_data():
    # Handle data editing here
    edited_data = request.form.get('edited_data')
    # Process the edited data
    return redirect(url_for('main.view_parsed_data'))
