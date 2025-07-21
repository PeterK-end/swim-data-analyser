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
        django-pwa
        gunicorn # WSGI HTTP Server for UNIX, fast clients and sleepy applications
        dateutil
        (
         buildPythonPackage rec {
         pname = "fit-tool";
         version = "0.9.13";
         src = fetchPypi {
           inherit pname version;
           sha256 = "sha256-Y9VlXbrPQSEXjndDrUzw2YCr1T2mMWpBnCBZQc4EnFU=";
         };
         doCheck = false;
         }
    )
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
      };
    };
}
