FROM python:3.12-slim

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y nodejs npm && apt-get clean

# Install Python dependencies (copy early for caching)
COPY requirements.txt ./
RUN pip install -r requirements.txt

# Copy JS deps early for caching
COPY package.json package-lock.json ./
RUN npm install

# Now copy the rest of the project
COPY . .

# Build frontend (hashed assets)
RUN npx webpack --mode production

# Collect static files
RUN python manage.py collectstatic --noinput

EXPOSE 8000
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "swim_data_analyser.wsgi:application"]
