from app.parsers.fit_parser import parse_fit_file
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

@main.route('/')
def index():
 return render_template('index.html')

@main.route('/merge', methods=['POST'])
def merge():
    labels_to_merge = request.json['labels']

    # Simple merge logic
    new_value = sum(item['value'] for item in data if item['label'] in labels_to_merge)
    data = [item for item in data if item['label'] not in labels_to_merge]
    data.append({"label": "+".join(labels_to_merge), "value": new_value})

    return jsonify(data)

@main.route('/split', methods=['POST'])
def split():
    label_to_splot = request.json['labels']

    # TODO: implement split logic

    return jsonify(data)

@main.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if file and allowed_file(file.filename):
        file_path = secure_filename(file.filename)
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

