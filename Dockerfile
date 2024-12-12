# Use an official Python runtime as a parent image
FROM python:3.12-slim

# Set the working directory in the container
WORKDIR /app

# Copy the current directory contents into the container at /app
COPY . /app

# Install node.js for running webpack
RUN apt-get update && apt-get install -y nodejs npm && \
    npm install -g npx

# Install Python dependencies
# Assuming requirements.txt includes Django, gunicorn and any other Python packages
COPY requirements.txt /app/
RUN pip install -r requirements.txt

# Install JavaScript dependencies and build assets
COPY package.json /app/
RUN npm install
RUN npx webpack

# Collect static files for Django
RUN python manage.py collectstatic --noinput

# Expose port 8000 for the Gunicorn server
EXPOSE 8000

# Start Gunicorn server
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "swim_data_analyser.wsgi:application"]
