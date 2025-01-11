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
from fit_tool.profile.messages.sport_message import SportMessage
from fit_tool.profile.messages.lap_message import LapMessage
from fit_tool.profile.messages.session_message import SessionMessage
from fit_tool.profile.messages.activity_message import ActivityMessage
from fit_tool.profile.messages.length_message import LengthMessage
from fit_tool.profile.messages.file_creator_message import FileCreatorMessage
from fit_tool.profile.profile_type import FileType, Manufacturer, Event, EventType, Sport, SubSport, SessionTrigger, DisplayMeasure, LengthType, LapTrigger, SwimStroke
from fit_tool.definition_message import DefinitionMessage
from fit_tool.utils.crc import crc16



def encode_js_object_to_fit(request):

    if request.method != 'POST':
        return JsonResponse({'error': 'Invalid request method. Use POST.'}, status=405)

    print(00)

    try:
        # Parse the incoming JSON object
        js_object = json.loads(request.body)
        print("loaded data")
        current_time = round(datetime.datetime.now().timestamp())

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

        # helper for time encoding
        def encode_time(time):
            parsed_time = parse(time).astimezone(timezone.utc)
            return int(parsed_time.timestamp() * 1000)

        with NamedTemporaryFile(delete=False, suffix=".fit") as tmp_file:
            file_path = tmp_file.name
            # Write placeholder FIT file header
            header = FitFileHeader(records_size=0, crc=0)
            tmp_file.write(header.to_bytes())

            print(0)
            # Write FileIdMessage
            file_id_data = js_object.get('file_ids', [])[0]
            message = FileIdMessage()
            message.type = FileType[file_id_data.get('type', 'ACTIVITY').upper()]
            message.manufacturer = Manufacturer[file_id_data.get('manufacturer', 'GARMIN').upper()]
            message.product = file_id_data.get('product', 0)
            message.time_created = encode_time(file_id_data.get('time_created', current_time))
            message.serial_number = file_id_data.get('serial_number', 0)
            definition = DefinitionMessage.from_data_message(message)
            write_message(tmp_file, definition)
            write_message(tmp_file, message)

            # File Creator
            event_file_creator = js_object.get('file_creator')
            message = FileCreatorMessage()
            message.software_version = event_file_creator.get('software_version', 0)
            definition = DefinitionMessage.from_data_message(message)
            write_message(tmp_file, definition)
            write_message(tmp_file, message)

            # Activity
            event_activity = js_object.get('activity', [])
            message = ActivityMessage()
            # message.local_timestamp = encode_time(event_activity.get('local_timestamp', current_time))
            message.event = Event[event_activity.get('event', 'ACTIVITY').upper()]
            message.event_type = EventType[event_activity.get('event_type', 'STOP').upper()]
            message.num_sessions = event_activity.get('num_sessions', 0)
            message.timestamp = encode_time(event_activity.get('timestamp', current_time))
            message.total_timer_time = event_activity.get('total_timer_time', 0)
            definition = DefinitionMessage.from_data_message(message)
            write_message(tmp_file, definition)
            write_message(tmp_file, message)

            # Event
            for index, event in enumerate(js_object.get('events', [])):
                try:
                    message = EventMessage()
                    message.event = Event[event.get('event', 'TIMER').upper()]
                    message.event_type = EventType[event.get('event_type', 'START').upper()]
                    message.timestamp = encode_time(event.get('timestamp', current_time))

                    if index == 0:  # Only needed for the first record of its                         print(DefinitionMessage.from_data_message(message))
                        definition = DefinitionMessage.from_data_message(message)
                        write_message(tmp_file, definition)

                    write_message(tmp_file, message)

                except Exception as e:
                    print(f"Error processing record at index {index}: {e}")
                    raise

            # Records
            for index, record in enumerate(js_object.get('records', [])):
                try:
                    message = RecordMessage()

                    message.timestamp = encode_time(record.get('timestamp', current_time))
                    message.elapsed_time = record.get('elapsed_time', None)
                    message.heart_rate = record.get('heart_rate', None)
                    message.timer_time = record.get('timer_time', None)

                    if index == 0:
                        definition = DefinitionMessage.from_data_message(message)
                        write_message(tmp_file, definition)

                    write_message(tmp_file, message)

                except Exception as e:
                    print(f"Error processing record at index {index}: {e}")
                    raise

            # Session
            print(3)
            event_session = js_object.get('sessions', [])[0]
            message = SessionMessage()
            message.avg_cadence = event_session.get('avg_cadence', 0)
            message.avg_heart_rate = event_session.get('avg_heart_rate', 0)
            message.avg_stroke_distance = event_session.get('avg_stroke_distance', 0)
            message.enhanced_avg_speed = event_session.get('enhanced_avg_speed', 0)/ 3.6 # some unexplained scaling
            message.enhanced_max_speed = event_session.get('enhanced_max_speed', 0)/ 3.6 # some unexplained scaling
            message.event = Event[event_session.get('event', 'SESSION').upper()]
            message.event_type = EventType[event_session.get('event_type', 'STOP').upper()]
            message.first_lap_index = event_session.get('first_lap_index', 0)
            message.max_heart_rate = event_session.get('max_heart_rate', 0)
            message.num_active_lengths = event_session.get('num_active_lengths', 0)
            message.num_laps = event_session.get('num_laps', 0)
            message.pool_length = event_session.get('pool_length', 0)
            message.pool_length_unit = DisplayMeasure[event_session.get('pool_length_unit', 'METRIC').upper()]
            message.sport = Sport[event_session.get('sport', 'SWIMMING').upper()]
            message.sub_sport = SubSport[event_session.get('sub_sport', 'LAP_SWIMMING').upper()]
            message.start_time = encode_time(event_session.get('start_time', current_time))
            message.total_anaerobic_effect = event_session.get('total_anaerobic_effect', 0)
            message.total_calories = event_session.get('total_calories', 0)
            message.total_cycles = event_session.get('total_cycles', 0)
            message.total_distance = event_session.get('total_distance', 0)
            message.total_elapsed_time = event_session.get('total_elapsed_time', 0)
            message.total_strokes = event_session.get('total_strokes', 0)
            message.total_timer_time = event_session.get('total_timer_time', 0)
            message.total_training_effect = event_session.get('total_training_effect', 0)
            message.trigger = SessionTrigger[event_session.get('trigger', 'ACTIVITY_END').upper()]

            definition = DefinitionMessage.from_data_message(message)
            write_message(tmp_file, definition)
            write_message(tmp_file, message)

            # Length
            lengths_data = js_object.get('lengths', [])
            for index, length_data in enumerate(lengths_data):
                try:
                    message = LengthMessage()
                    length_type = length_data.get('length_type', 'IDLE').upper()
                    if length_type == "IDLE":
                        message.event = Event[length_data.get('event', 'LENGTH').upper()]
                        message.event_type = EventType[length_data.get('event_type', 'STOP').upper()]
                        message.length_type = LengthType[length_type]
                        message.start_time = encode_time(length_data.get('start_time'))
                        message.timestamp = encode_time(length_data.get('timestamp'))
                        message.total_elapsed_time = length_data.get('total_elapsed_time', 0)
                        message.total_timer_time = length_data.get('total_timer_time', 0)
                        definition = DefinitionMessage.from_data_message(message)
                        write_message(tmp_file, definition)

                    if length_type == "ACTIVE":
                        message.avg_speed = length_data.get('avg_speed', 0) / 3.6 # some unexplained scaling
                        message.avg_swimming_cadence = length_data.get('avg_swimming_cadence', 0)
                        message.event = Event[length_data.get('event', 'LENGTH').upper()]
                        print(Event[length_data.get('event', 'LENGTH').upper()])
                        message.event_type = EventType[length_data.get('event_type', 'STOP').upper()]
                        print(EventType[length_data.get('event_type', 'STOP').upper()])
                        message.length_type = LengthType[length_type]
                        message.swim_stroke = SwimStroke[length_data.get('swim_stroke', 'MIXED').upper()]
                        message.start_time = encode_time(length_data.get('start_time'))
                        message.timestamp = encode_time(length_data.get('timestamp'))
                        message.total_elapsed_time = length_data.get('total_elapsed_time', 0)
                        message.total_strokes = length_data.get('total_strokes', 0)
                        message.total_timer_time = length_data.get('total_timer_time', 0)
                        definition = DefinitionMessage.from_data_message(message)
                        write_message(tmp_file, definition)

                    # Write the data message
                    write_message(tmp_file, message)

                except Exception as e:
                    print(f"Error processing length at index {index}: {e}")
                    raise

            # Lap
            laps_data = js_object.get('laps', [])
            for index, lap_data in enumerate(laps_data):
                try:
                    message = LapMessage()

                    message.avg_cadence = lap_data.get('avg_cadence', 0)
                    message.avg_heart_rate = lap_data.get('avg_heart_rate', 0)
                    message.avg_stroke_distance = lap_data.get('avg_stroke_distance', 0)
                    message.enhanced_avg_speed = lap_data.get('enhanced_avg_speed', 0)
                    message.enhanced_max_speed = lap_data.get('enhanced_max_speed', 0)
                    message.event = Event[lap_data.get('event', 'LAP').upper()]
                    message.event_type = EventType[lap_data.get('event_type', 'STOP').upper()]
                    message.first_length_index = lap_data.get('first_length_index', 0)
                    message.lap_trigger = LapTrigger[lap_data.get('lap_trigger', 'MANUAL').upper()]
                    message.max_heart_rate = lap_data.get('max_heart_rate', 0)
                    message.num_active_lengths = lap_data.get('num_active_lengths', 0)
                    message.num_lengths = lap_data.get('num_lengths', 0)
                    message.sport = Sport[lap_data.get('sport', 'SWIMMING').upper()]
                    message.sub_sport = SubSport[lap_data.get('sub_sport', 'LAP_SWIMMING').upper()]
                    message.start_time = encode_time(lap_data.get('start_time'))
                    message.timestamp = encode_time(lap_data.get('timestamp'))
                    message.total_calories = lap_data.get('total_calories', 0)
                    message.total_cycles = lap_data.get('total_cycles', 0)
                    message.total_distance = lap_data.get('total_distance', 0)
                    message.total_elapsed_time = lap_data.get('total_elapsed_time', 0)
                    message.total_timer_time = lap_data.get('total_timer_time', 0)

                    # Define the message structure only for the first lap
                    if index == 0:
                        definition = DefinitionMessage.from_data_message(message)
                        write_message(tmp_file, definition)

                    # Write the data message
                    write_message(tmp_file, message)

                except Exception as e:
                    print(f"Error processing lap at index {index}: {e}")
                    raise

            # Sports
            event_sports = js_object.get('sports', [])[0]
            message = SportMessage()
            message.sport_name = event_sports.get('name', '')
            message.sport = Sport[event_sports.get('sport', 'SWIMMING').upper()]
            message.sub_sport = SubSport[event_sports.get('sub_sport', 'LAP_SWIMMING').upper()]
            definition = DefinitionMessage.from_data_message(message)
            write_message(tmp_file, definition)
            write_message(tmp_file, message)

            # User Profile

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
