# swim-data-analyser

The swim-data-analyser is a tool to manipulate and analyze swim workouts from FIT files as provided by Garmin devices. It is heavily inspired by [Swimming Watch Tools](https://www.swimmingwatchtools.com/).

The goal is to provide full client-side parsing and handling of the data, ensuring that no data is transmitted to the server. In the future, long term analysis of workouts is planned. For this use case, an appropriate backend with user handling will be developed. While a database is necessary for this purpose, basic parsing and analysis of single workouts will remain client-side for casual website users.

# developement

The project uses Nix flakes to manage developement dependencies. You can follow the setup instructions provided in the section 'Setup' of this [tutorial](https://jupyenv.io/documentation/getting-started/).

dev environment:

```
nix develop
```

getting started:
```
npm install
```

spin up dev server:

```
npx webpack --watch
python manage.py runserver
```

# deployment

1. Clone the repository:

```
git clone https://github.com/PeterK-end/swim-data-analyser
```

2.
- adjust `swim_data_analyser/settings.py`
  - change `SECRET_KEY` and `ALLOWED_HOSTS`
  - set `CSRF_TRUSTED_ORIGINS` to your domain

2. Build the Docker Image

```
docker build -t swim-data-analyser:latest .
```

4. Serve static content and Docker

```
docker run -d --restart=unless-stopped -p 127.0.0.1:8000:8000 swim-data-analyser:latest
```

- make sure to serve static content via your webserver (e.g. `docker cp <container_id>:/app/static /srv/swim-data-analyser`) and proxy requests to 8000

# used libraries

The project depends on some core libraries listed below:


- parsing and encoding of `.fit` files: https://github.com/garmin/fit-javascript-sdk
- plots: https://github.com/plotly/plotly.js/
- server and (future) backend: https://www.djangoproject.com/
