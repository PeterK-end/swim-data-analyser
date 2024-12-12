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
      };
    };
}
