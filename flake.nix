{
  description = "Project Dependencies for swim-data-analyser";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
      python-env = pkgs.python312.withPackages (pp: with pp; [
        django
        gunicorn # WSGI HTTP Server for UNIX, fast clients and sleepy applications
      ]);
    in {
      # Define both development and deployment shells under devShells
      devShells.${system} = {
        # Development shell
        default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs
            nodePackages.webpack
            nodePackages.webpack-cli
          ] ++ [python-env];
          shellHook = ''
             echo 'Dependencies loaded to development environment.'
          '';
        };

        # Deployment shell with runtime dependencies and JS asset build
        deployment = pkgs.mkShell {
          buildInputs = [
            python-env
            pkgs.nodejs
            pkgs.nodePackages.webpack
            pkgs.nodePackages.webpack-cli
          ];

          shellHook = ''
            # Build static files with Webpack for production
            echo "Building JS and CSS assets..."
            npm install  # Install Node packages defined in package.json
            npx webpack  # Run Webpack to generate production assets

            # Django collectstatic for production
            python manage.py collectstatic --noinput

            # Run Gunicorn server
            echo "Starting Gunicorn..."
            ${python-env}/bin/gunicorn --bind 0.0.0.0:8000 swim_data_analyser.wsgi:application &
            echo "Gunicorn is running on 0.0.0.0:8000."
         '';
        };
      };
    };
}
