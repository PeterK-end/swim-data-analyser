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
flask run
```
