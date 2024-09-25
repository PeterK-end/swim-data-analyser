from flask import Blueprint, render_template, jsonify, request, redirect, url_for, flash, send_from_directory
from os.path import join, dirname, realpath
from werkzeug.utils import secure_filename
import copy
import flask_session
import os
import json

main= Blueprint('main', __name__)

# Session variables
DATA_PATH = join(dirname(realpath(__file__)), 'static/data/')
ALLOWED_EXTENSIONS = {'json'}
session = {}

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

