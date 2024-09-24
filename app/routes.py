from app.parsers.fit_parser import parse_fit_file
from flask import Blueprint, render_template, jsonify, request, redirect, url_for, flash, send_from_directory
from os.path import join, dirname, realpath
from werkzeug.utils import secure_filename
import copy
import fitdecode
import flask_session
import os
import pandas as pd
import json

main= Blueprint('main', __name__)

# Session variables
DATA_PATH = join(dirname(realpath(__file__)), 'static/data/')
ALLOWED_EXTENSIONS = {'json'}
session = {}

# helper
def pull_each(name, data):
    return [entry.get(name) for entry in data if entry.get(name)]

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def refresh_meta():
    if not session['modified_data']:
        raise ValueError("Modified data not found in session.")

    lengths = session['modified_data']['length']
    active_lengths =  [entry for entry in
                       session['modified_data']['length'] if entry['event'] == 'length'
                       and entry['length_type'] == 'active']

    # update meta
    session_data = session['modified_data']['session']
    session_data[0]['total_elapsed_time'] = sum(pull_each('total_elapsed_time', lengths))
    session_data[0]['total_distance'] = len(active_lengths)*session_data[0]['pool_length']
    session_data[0]['total_strokes'] = sum(pull_each('total_strokes', lengths))
    session_data[0]['num_lengths'] = len(active_lengths)

@main.route('/')
def index():
 return render_template('index.html')

@main.route('/getDefaultData', methods=['GET'])
def getDefaultData():
    default_file_path = os.path.join(DATA_PATH, 'example_workout.json')

    try:
        # Open the file and load its contents as JSON
        with open(default_file_path, 'r') as default_file:
            data = json.load(default_file)

        # Return the JSON data to the frontend
        return jsonify(data)

    except Exception as e:
        # Handle file not found or JSON parsing errors
        return jsonify({'error': 'Failed to load default data', 'message': str(e)}), 500

@main.route('/getCurrentData', methods=['GET'])
def getCurrentData():
    refresh_meta()
    return jsonify(session['modified_data'])

@main.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if file and allowed_file(file.filename):
        try:
            parsed_data = parse_fit_file(file.stream)
            # Store the parsed data in the session
            session['original_data'] = copy.deepcopy(parsed_data)  # Store original data
            session['modified_data'] = copy.deepcopy(parsed_data)  # Store modifiable copy of data
            return jsonify(session['modified_data'])
        except Exception as e:
            return jsonify({"error": "Failed to parse file"}), 500
    else:
        return jsonify({"error": "Only .fit files are allowed for upload."}), 400


@main.route('/merge', methods=['POST'])
def merge():
    labels_to_merge = request.json['labels']

    length_data = [entry for entry in
                   session['modified_data']['length'] if entry['event'] == 'length'
                   and entry['length_type'] == 'active']

    merge_entries = [entry for i, entry in enumerate(length_data) if i in labels_to_merge]

    new_entry = {
        'timestamp': merge_entries[0]['timestamp'],
        'start_time': merge_entries[0]['start_time'],
        'total_elapsed_time': sum(pull_each('total_elapsed_time', merge_entries)),
        'total_timer_time': sum(pull_each('total_timer_time', merge_entries)),
        'message_index': min(pull_each('message_index', merge_entries)),
        'total_strokes': sum(pull_each('total_strokes', merge_entries)),
        'avg_speed': sum(pull_each('avg_speed', merge_entries))/len(pull_each('avg_speed', merge_entries)),
        'total_calories': sum(pull_each('total_calories', merge_entries)),
        'event': merge_entries[0]['event'],
        'event_type': merge_entries[0]['event_type'],
        'swim_stroke': merge_entries[0]['swim_stroke'],
        'avg_swimming_cadence': sum(pull_each('avg_swimming_cadence', merge_entries))/len(pull_each('avg_swimming_cadence', merge_entries)),
        'event_group': None,
        'length_type': merge_entries[0]['length_type']
    }

    new_data = [entry for i, entry in enumerate(length_data) if i not in labels_to_merge]
    new_data.insert(min(labels_to_merge), new_entry)

    session['modified_data']['length'] = new_data

    return jsonify(session['modified_data'])

@main.route('/split', methods=['POST'])
def split():
    label_to_split = request.json['labels'][0]

    length_data = [(i, entry) for i, entry in
                   enumerate(session['modified_data']['length'])
                   if entry['event'] == 'length' and entry['length_type'] == 'active']

    entry = length_data[label_to_split][1]

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

    length_data[label_to_split] = (label_to_split, split_entry.copy())
    length_data.insert(label_to_split+1, (label_to_split, split_entry.copy()))

    session['modified_data']['length'] = [entry for _, entry in length_data]

    return jsonify(session['modified_data'])

@main.route('/getSummaryData', methods=['GET'])
def getSummaryData():
    df = pd.DataFrame(session['modified_data']['length'])
    grouped_df = df.groupby('swim_stroke').agg(
        total_lengths=('swim_stroke', 'count'),
        total_time=('total_elapsed_time', 'sum'),
        avg_spl=('total_strokes', lambda x: x.sum() / len(x)),
        avg_spm=('avg_swimming_cadence', lambda x: x.sum() / len(x))
    ).to_dict(orient='index')

    return jsonify([grouped_df, session['modified_data']])
