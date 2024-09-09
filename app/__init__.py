import os
from flask import Flask
from flask_session import Session
from datetime import timedelta

def create_app():
    app = Flask(__name__)

    # Set the secret key for sessions and flash messages
    app.secret_key = os.urandom(24)

    # Configuring session to use filesystem (server-side storage)
    # TODO: update flask session to 0.8 and use CacheLib;
    # https://flask-session.readthedocs.io/en/latest/config.html
    app.config['SESSION_TYPE'] = 'filesystem'
    app.config['SESSION_FILE_DIR'] = os.path.join(app.root_path, 'flask_sessions')
    # Setting session expiration settings
    app.config['SESSION_PERMANENT'] = True  # Sessions will expire after a set time
    app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=30)  # Set to 30 minutes

    # Initialize the session extension
    Session(app)

    # Import routes
    from .routes import main
    app.register_blueprint(main)

    return app
