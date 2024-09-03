import os
from flask import Flask

def create_app():
    app = Flask(__name__)

    # Set the secret key for sessions and flash messages
    app.secret_key = os.urandom(24)

    # Import routes
    from .routes import main
    app.register_blueprint(main)

    return app
