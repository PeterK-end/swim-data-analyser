{
  description = "Project Dependencies for swim-data-analyser";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
  };

  outputs = inputs:
  let
    system = "x86_64-linux";
    pkgs = inputs.nixpkgs.legacyPackages.${system};
    python-env = pkgs.python310.withPackages (pp: with pp;
    [
      flask
      flask-session
    ]);
   in {
     devShell."${system}" = pkgs.mkShell {
       buildInputs =  with pkgs; [
         nodejs
         nodePackages.webpack
         nodePackages.webpack-cli
       ] ++ [python-env];
       shellHook = ''
           echo 'Dependencies loaded to environment.'
        '';
     };
   };
}
