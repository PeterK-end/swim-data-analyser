# swim-data-analyser

The swim-data-analyser is a tool to manipulate and analyze swim workouts from FIT files as provided by Garmin devices. It is heavily inspired by [Swimming Watch Tools](https://www.swimmingwatchtools.com/).

The goal is to provide full client-side parsing and handling of the data, ensuring that no data is transmitted to the server. Your files are processed entirely in your browser.

# development

The project uses Nix flakes to manage development dependencies.

dev environment:

```bash
nix develop
```

getting started:
```bash
npm install
```

spin up dev server (with HMR):

```bash
npm run dev
```

# deployment

The project is a pure static site. It can be built and served via any web server.

## Build

```bash
npm run build
```

The output will be in the `dist/` directory.

## Docker

1. Build the Docker Image:

```bash
docker build -t swim-data-analyser:latest .
```

2. Run the container:

```bash
docker run -d --restart=unless-stopped -p 8080:80 swim-data-analyser:latest
```

The app will be available at `http://localhost:8080`.

# used libraries

- parsing and encoding of `.fit` files: [@garmin/fitsdk](https://github.com/garmin/fit-javascript-sdk)
- plots: [plotly.js](https://github.com/plotly/plotly.js/)
- build tool: [Vite](https://vitejs.dev/)
