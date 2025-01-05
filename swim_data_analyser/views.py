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

import datetime
from dateutil.parser import parse
from datetime import timezone
import json
import struct
import os
from datetime import timezone
from django.http import JsonResponse, FileResponse
from tempfile import NamedTemporaryFile
from fit_tool.fit_file_header import FitFileHeader
from fit_tool.record import Record
from fit_tool.profile.messages.file_id_message import FileIdMessage
from fit_tool.profile.messages.event_message import EventMessage
from fit_tool.profile.messages.record_message import RecordMessage
from fit_tool.profile.profile_type import FileType, Manufacturer, Event, EventType
from fit_tool.definition_message import DefinitionMessage
from fit_tool.utils.crc import crc16

def encode_js_object_to_fit(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Invalid request method. Use POST.'}, status=405)

    try:
        # Parse the incoming JSON object
        js_object = json.loads(request.body)

        # Prepare to write the FIT file
        records_crc = 0
        records_size = 0

        def write_message(file_object, message):
            nonlocal records_crc, records_size
            record = Record.from_message(message)
            buffer = record.to_bytes()
            file_object.write(buffer)
            records_size += len(buffer)
            records_crc = crc16(buffer, crc=records_crc)

        with NamedTemporaryFile(delete=False, suffix=".fit") as tmp_file:
            file_path = tmp_file.name
            # Write placeholder FIT file header
            header = FitFileHeader(records_size=0, crc=0)
            tmp_file.write(header.to_bytes())

            # Write FileIdMessage
            file_id_data = js_object.get('file_id', {})
            message = FileIdMessage()
            message.type = FileType[file_id_data.get('type', 'ACTIVITY').upper()]
            message.manufacturer = file_id_data.get('manufacturer', Manufacturer.DEVELOPMENT.value)
            message.product = file_id_data.get('product', 0)
            message.time_created = file_id_data.get('time_created', round(datetime.datetime.now().timestamp() * 1000))
            message.serial_number = file_id_data.get('serial_number', 0)
            definition = DefinitionMessage.from_data_message(message)
            write_message(tmp_file, definition)
            write_message(tmp_file, message)

            # Write EventMessage for START
            event_start_data = js_object.get('event_start', {})
            message = EventMessage()
            message.event = Event[event_start_data.get('event', 'TIMER').upper()]
            message.event_type = EventType[event_start_data.get('event_type', 'START').upper()]
            message.timestamp = event_start_data.get('timestamp', round(datetime.datetime.now().timestamp() * 1000))
            definition = DefinitionMessage.from_data_message(message)
            write_message(tmp_file, definition)
            write_message(tmp_file, message)

            index = 0

            for record in js_object.get('records', []):
                try:
                    message = RecordMessage()

                    # Parse ISO 8601 timestamp to UNIX timestamp
                    iso_timestamp = record.get('timestamp')
                    parsed_time = parse(iso_timestamp).astimezone(timezone.utc)  # Ensure UTC                     print(f"parsed_tim", parsed_time)
                    message.timestamp = int(parsed_time.timestamp()) * 1000
                    message.elapsed_time = record.get('elapsed_time', None)
                    message.heart_rate = record.get('heart_rate', None)
                    message.timer_time = record.get('timer_time', None)

                    if index == 0:  # Only needed for the first record of its                         print(DefinitionMessage.from_data_message(message))
                        definition = DefinitionMessage.from_data_message(message)
                        write_message(tmp_file, definition)

                    write_message(tmp_file, message)
                    index += 1

                except Exception as e:
                    print(f"Error processing record at index {index}: {e}")
                    raise

            print("hellohello2")
            # Write EventMessage for STOP
            # event_stop_data = js_object.get('event_stop', {})
            # message = EventMessage()
            # message.event = Event[event_stop_data.get('event', 'TIMER').upper()]
            # message.event_type = EventType[event_stop_data.get('event_type', 'STOP').upper()]
            # message.timestamp = event_stop_data.get('timestamp', record_timestamp)
            # definition = DefinitionMessage.from_data_message(message)
            # write_message(tmp_file, definition)
            # write_message(tmp_file, message)
            print("hellohello")

            # Write CRC
            tmp_file.write(struct.pack('<H', records_crc))

            # Write updated FIT file header
            header = FitFileHeader(records_size=records_size, gen_crc=True)
            tmp_file.seek(0)
            tmp_file.write(header.to_bytes())

            # Serve the FIT file for download
            response = FileResponse(open(file_path, 'rb'), as_attachment=True, filename="activity.fit")
            os.remove(file_path)
            return response

    except Exception as e:
        return JsonResponse({'error': 'Failed to encode FIT file', 'message': str(e)}, status=500)
