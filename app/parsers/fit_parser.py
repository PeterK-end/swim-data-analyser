import fitdecode
from datetime import time, datetime

def convert_to_serializable(value):
    """Helper function to convert non-serializable types to serializable ones"""
    if isinstance(value, (datetime, time)):
        return value.isoformat()  # Convert datetime and time to ISO format strings
    return value

def parse_fit_file(file_path):
    data_blocks = {}

    with fitdecode.FitReader(file_path) as fit:
        for frame in fit:
            if isinstance(frame, fitdecode.records.FitDataMessage):
                block_name = frame.name

                # Extract the fields and ensure serializability
                data = {field.name: convert_to_serializable(field.value) for field in frame.fields if 'unknown_' not in field.name}

                # Dynamically add blocks
                if block_name not in data_blocks:
                    data_blocks[block_name] = []

                data_blocks[block_name].append(data)

    return data_blocks
