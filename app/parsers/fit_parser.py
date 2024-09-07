import fitdecode

def parse_fit_file(file_path):
    data_blocks = {}

    with fitdecode.FitReader(file_path) as fit:
        for frame in fit:
            if isinstance(frame, fitdecode.records.FitDataMessage):
                block_name = frame.name

                # Extract the fields
                data = {field.name: field.value for field in frame.fields if 'unknown_' not in field.name}

                # Append to the corresponding block list
                if block_name not in data_blocks:
                    data_blocks[block_name] = []

                data_blocks[block_name].append(data)


    parsed_content = data_blocks['length']
    data_for_plot = [
        {'duration': d.get('total_elapsed_time', 0), 'length': i}
                for i, d in enumerate(parsed_content)  # Adjust according to actual structure
    ]
    # Return the parsed data, adjust as necessary
    return data_for_plot
