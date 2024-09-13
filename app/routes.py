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
    session['original_data'] = parsed_data  # Store original data
    session['modified_data'] = parsed_data.copy()  # Store modifiable copy of data

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
        try:
            parsed_data = parse_fit_file(file_path)
            # Store the parsed data in the session
            session['original_data'] = parsed_data  # Store original data
            session['modified_data'] = parsed_data  # Store modifiable copy of data
            return jsonify(parsed_data)
        except Exception as e:
            return jsonify({"error": "Failed to parse file"}), 500
    else:
        return jsonify({"error": "Only .fit files are allowed for upload."}), 400


@main.route('/merge', methods=['POST'])
def merge():
    labels_to_merge = request.json['labels']
    length_data = [
        (i, entry) for i, entry in enumerate(session['modified_data']['length'])
    if entry['event'] == 'length' and entry['length_type'] == 'active'
    ]

    merge_entries = [entry for i, entry in length_data if i in labels_to_merge]

    # helper
    def pull_each(name, data=merge_entries):
        return [entry.get(name) for entry in data if entry.get(name)]

    new_entry = {
        'timestamp': merge_entries[0]['timestamp'],
        'start_time': merge_entries[0]['start_time'],
        'total_elapsed_time': sum(pull_each('total_elapsed_time')),
        'total_timer_time': sum(pull_each('total_timer_time')),
        'message_index': min(pull_each('message_index')),
        'total_strokes': sum(pull_each('total_strokes')),
        'avg_speed': sum(pull_each('avg_speed'))/len(pull_each('avg_speed')),
        'total_calories': sum(pull_each('total_calories')),
        'event': merge_entries[0]['event'],
        'event_type': merge_entries[0]['event_type'],
        'swim_stroke': merge_entries[0]['swim_stroke'],
        'avg_swimming_cadence': sum(pull_each('avg_swimming_cadence'))/len(pull_each('avg_swimming_cadence')),
        'event_group': None,
        'length_type': merge_entries[0]['length_type']
    }

    new_data = [entry for i, entry in length_data if i not in labels_to_merge]
    new_data.insert(min(labels_to_merge), new_entry)

    session['modified_data']['length'] = new_data

    # TODO: call update metadata function

    return jsonify(session['modified_data'])

@main.route('/split', methods=['POST'])
def split():
    label_to_split = request.json['labels'][0]
    # filter according to plot view
    length_data = [
        (i, entry) for i, entry in enumerate(session['modified_data']['length'])
    if entry['event'] == 'length' and entry['length_type'] == 'active'
    ]

    entry = length_data[label_to_split][1].copy()

    split_entry = {
        'timestamp': entry['timestamp'],
        'start_time': entry['start_time'],
        'total_elapsed_time': entry['total_elapsed_time']/2,
        'total_timer_time': entry['total_timer_time']/2,
        'message_index': entry['message_index'],
        'total_strokes': entry['total_strokes']/2,
        'avg_speed': entry['avg_speed'],
        'total_calories': entry['total_calories'],
        'event': entry['event'],
        'event_type': entry['event_type'],
        'swim_stroke': entry['swim_stroke'],
        'avg_swimming_cadence': entry['avg_swimming_cadence'],
        'event_group': None,
        'length_type': entry['length_type']
    }

    length_data[label_to_split] = (label_to_split, split_entry)
    length_data.insert(label_to_split+1, (label_to_split, split_entry.copy()))

    session['modified_data']['length'] = [entry for _, entry in length_data]

    return jsonify(session['modified_data'])

# @main.route('/changePoolSize', methods=['POST'])
# def changePoolSize():
#     label_to_splot = request.json['labels']

#     # TODO: implement logic

#     return jsonify(data)

@main.route('/changeStroke', methods=['POST'])
def changeStroke():
    user_input = request.json
    labels = user_input['labels']  # The selected labels
    stroke = user_input['stroke']  # The selected stroke

    # filter according to plot view
    length_data = [entry for entry in
                   session['modified_data']['length'] if entry['event'] == 'length'
                   and entry['length_type'] == 'active']

    for length in labels:
        length_data[length]['swim_stroke'] = stroke

    session['modified_data']['length'] = length_data

    # TODO: call update metadata function

    return jsonify(session['modified_data'])

@main.route('/deleteLength', methods=['POST'])
def deleteLength():
    label_to_delete = request.json['labels']

    new_data = [entry for i, entry in
                enumerate(session['modified_data']['length']) if
                entry['event'] == 'length' and
                entry['length_type'] == 'active' and
                i not in label_to_delete]

    session['modified_data']['length'] = new_data

    # TODO: call update metadata function

    return jsonify(session['modified_data'])

@main.route('/undoChanges', methods=['POST'])
def undoChanges():

    session['modified_data'] = session['original_data']

    return jsonify(session['modified_data'])
