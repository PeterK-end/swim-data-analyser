(define-module (guix-packager)
  #:use-module (guix)
  #:use-module ((guix licenses) #:prefix license:)
  #:use-module (gnu packages)
  #:use-module (guix build-system gnu)
  #:use-module (guix build-system python)
  #:use-module (guix build-system pyproject)
  #:use-module (guix git-download)
  #:use-module (gnu packages compression)
  #:use-module (gnu packages linux)
  #:use-module (gnu packages autotools)
  #:use-module (gnu packages flex)
  #:use-module (gnu packages pkg-config)
  #:use-module (gnu packages bison)
  #:use-module (gnu packages python-science)
  #:use-module (gnu packages admin))

(define-public python-fitdecode
  (package
    (name "python-fitdecode")
    (version "0.10.0")
    (source
     (origin
       (method url-fetch)
       (uri (pypi-uri "fitdecode" version))
       (sha256
        (base32 "1r13a60xc7ar8nsxbfvnjwiay75agrsj4wvs6w8hqrc77hqd318v"))))
    (build-system pyproject-build-system)
    (arguments
     `(#:tests? #f))  ; Disable the check phase
    (home-page "https://github.com/polyvertex/fitdecode")
    (synopsis "FIT file parser and decoder")
    (description "FIT file parser and decoder.")
    (license license:expat)))

(define-public python-gpxpy
  (package
    (name "python-gpxpy")
    (version "1.6.2")
    (source
     (origin
       (method url-fetch)
       (uri (pypi-uri "gpxpy" version))
       (sha256
        (base32 "1bh1dkrbmcqb46r7j4fazzq7j6zfr2f04frm6h4bhhpcjx5lhb57"))))
    (build-system pyproject-build-system)
    (home-page "https://github.com/tkrajina/gpxpy")
    (synopsis "GPX file parser and GPS track manipulation library")
    (description "GPX file parser and GPS track manipulation library.")
    (license license:asl2.0)))

(define-public python-fit2gpx
  (package
   (name "python-fit2gpx")
   (version "0.0.7")
   (source
    (origin
     (method url-fetch)
     (uri (pypi-uri "fit2gpx" version))
     (sha256
      (base32 "1qdphcn07pq8j4v7s4ijvcfyymvfrz57khlxzg20hwqlv9rsx1xl"))))
   (build-system pyproject-build-system)
   (arguments
    `(#:tests? #f))  ; Disable the check phase
   (propagated-inputs (list python-fitdecode python-gpxpy python-pandas))
   (home-page "https://github.com/dodo-saba/fit2gpx")
   (synopsis
    "Package to convert .FIT files to .GPX files, including tools for .FIT files downloaded from Strava")
   (description
    "Package to convert .FIT files to .GPX files, including tools for .FIT files
downloaded from Strava.")
   (license #f)))

(define-public python-fitparse
  (package
    (name "python-fitparse")
    (version "1.2.0")
    (source
     (origin
       (method url-fetch)
       (uri (pypi-uri "fitparse" version))
       (sha256
        (base32 "1adl2svpn2m5cynd6p497a5gwrx4gh0nxk0kmnmnvsid8li10s9d"))))
    (build-system pyproject-build-system)
    (home-page "https://www.github.com/dtcooper/python-fitparse")
    (synopsis "Python library to parse ANT/Garmin .FIT files")
    (description "Python library to parse ANT/Garmin .FIT files.")
    (license #f)))

;; This allows you to run guix shell -f guix-packager.scm.
;; Remove this line if you just want to define a package.
;; nfdump

(list python-fitdecode python-fit2gpx python-fitparse)

;; TODO
;; set up export and add tcp dump for testing
