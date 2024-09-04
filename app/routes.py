from flask import Blueprint, render_template, jsonify, request, redirect, url_for, flash
from werkzeug.utils import secure_filename
import fitdecode
import os
import json

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

def parse_fit_file(file_path):

    data_blocks = {}

    with fitdecode.FitReader(file_path) as fit:
        for frame in fit:
            if isinstance(frame, fitdecode.records.FitDataMessage):
                block_name = frame.name

                # Extract the fields
                data = {field.name: field.value for field in
                        frame.fields if 'unknown_' not in field.name}

                # Append to the corresponding block list
                if block_name not in data_blocks:
                    data_blocks[block_name] = []

                data_blocks[block_name].append(data)

    # !!! not ready, testing
    return data_blocks['length']

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
        return jsonify({"error": "No file part"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        user_folder = get_user_upload_folder()
        file_path = os.path.join(user_folder, filename)
        file.save(file_path)
        try:
            parsed_content = parse_fit_file(file_path)
            # Assuming parsed_content is a dict, extract data for plotting
            # Convert to list of dicts with 'length' and 'heart_rate'
            data_for_plot = [
                {'duration': d.get('total_elapsed_time', 0), 'length': i}
                for i, d in enumerate(parsed_content)  # Adjust according to actual structure
            ]
            print(f"Watch out, data dump: {data_for_plot}")
            return jsonify(data_for_plot)
        except Exception as e:
            return jsonify({"error": "Failed to parse file"}), 500
    else:
        return jsonify({"error": "Only .fit files are allowed for upload."}), 400

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
