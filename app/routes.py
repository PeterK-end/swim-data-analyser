from flask import Blueprint, render_template, jsonify, request

main = Blueprint('main', __name__)

# Sample data
data = [
    {"label": "A", "value": 10},
    {"label": "B", "value": 15},
    {"label": "C", "value": 20}
]

@main.route('/')
def index():
    return render_template('index.html', data=data)

@main.route('/merge', methods=['POST'])
def merge():
    global data
    labels_to_merge = request.json['labels']

    # Simple merge logic
    new_value = sum(item['value'] for item in data if item['label'] in labels_to_merge)
    data = [item for item in data if item['label'] not in labels_to_merge]
    data.append({"label": "+".join(labels_to_merge), "value": new_value})

    return jsonify(data)
