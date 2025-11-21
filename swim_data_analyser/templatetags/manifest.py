from django import template
import json, os
from django.conf import settings

register = template.Library()

def load_manifest():
    manifest_path = os.path.join(
        settings.BASE_DIR,
        "swim_data_analyser/static/js/dist/manifest.json"
    )
    with open(manifest_path, "r") as f:
        return json.load(f)

@register.simple_tag
def webpack_bundle(name):
    manifest = load_manifest()
    return manifest.get(name, name)
