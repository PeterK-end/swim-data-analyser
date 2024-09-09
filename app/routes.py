from app.parsers.fit_parser import parse_fit_file
from flask import Blueprint, render_template, jsonify, request, redirect, url_for, flash, send_from_directory
from werkzeug.utils import secure_filename
import flask_session
import fitdecode
import os
from os.path import join, dirname, realpath

main= Blueprint('main', __name__)

# Session variables
UPLOAD_PATH = join(dirname(realpath(__file__)), 'static/upload/')
ALLOWED_EXTENSIONS = {'fit'}
session = {}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@main.route('/')
def index():
 return render_template('index.html')

@main.route('/get_default_data')
def get_default_data():

    default_file = os.path.join(UPLOAD_PATH, 'default_workout.fit')
    parsed_data = parse_fit_file(default_file)

    return jsonify(parsed_data)

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
            parsed_data = parse_fit_file(file_path)
            return jsonify(parsed_data)
        except Exception as e:
            return jsonify({"error": "Failed to parse file"}), 500
    else:
        return jsonify({"error": "Only .fit files are allowed for upload."}), 400


@main.route('/merge', methods=['POST'])
def merge():
    labels_to_merge = request.json['labels']

    # Simple merge logic
    new_value = sum(item['value'] for item in data if item['label'] in labels_to_merge)
    data = [item for item in data if item['label'] not in labels_to_merge]
    data.mainend({"label": "+".join(labels_to_merge), "value": new_value})

    return jsonify(data)

@main.route('/split', methods=['POST'])
def split():
    label_to_splot = request.json['labels']

    # TODO: implement split logic

    return jsonify(data)
