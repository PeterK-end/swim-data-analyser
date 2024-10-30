# swim_data_analyser/views.py
from django.conf import settings
from django.contrib import messages
from django.http import JsonResponse
from django.shortcuts import render
from pathlib import Path
import json
import os

# BASE_DIR: Path to the project root directory
BASE_DIR = Path(__file__).resolve().parent.parent

DATA_PATH = os.path.join(settings.BASE_DIR, 'swim_data_analyser', 'static', 'data')

def index(request):
    return render(request, 'index.html')

def about(request):
    return render(request, 'about.html')

def get_default_data(request):
    default_file_path = os.path.join(DATA_PATH, 'example_workout.json')
    try:
        with open(default_file_path, 'r') as default_file:
            data = json.load(default_file)
        return JsonResponse(data)
    except Exception as e:
        return JsonResponse({'error': 'Failed to load default data', 'message': str(e)}, status=500)
