(nginx-server-configuration
 (listen '("443 ssl" "[::]:443 ssl"))
 (server-name '("swimdata.org"))
 (ssl-certificate "/etc/letsencrypt/live/swimdata.org/fullchain.pem")
 (ssl-certificate-key "/etc/letsencrypt/live/swimdata.org/privkey.pem")

 (locations
  (list
   ;; 1. Root & HTML -> Proxy to Vite/Nginx Docker (exposed at 8080)
   ;; Force revalidation so users always get the newest index.html (which points to new hashed assets)
   (nginx-location-configuration
    (uri "/")
    (body '("proxy_pass http://127.0.0.1:8080;"
            "add_header Cache-Control \"no-cache, no-store, must-revalidate\";"
            "proxy_set_header Host $host;"
            "proxy_set_header X-Real-IP $remote_addr;"
            "proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
            "client_max_body_size 5M;")))

   ;; 2. Service worker (Vite default is /sw.js) -> must NEVER be cached
   (nginx-location-configuration
    (uri "= /sw.js")
    (body '("proxy_pass http://127.0.0.1:8080/sw.js;"
            "add_header Cache-Control \"no-cache, no-store, must-revalidate\";")))

   ;; 3. Hashed Vite Assets (JS, CSS) -> cached forever (immutable)
   ;; Vite puts hashed files in /assets/
   (nginx-location-configuration
    (uri "/assets/")
    (body '("proxy_pass http://127.0.0.1:8080/assets/;"
            "expires 1y;"
            "add_header Cache-Control \"public, immutable\";")))

   ;; 4. Other static files (icons, fonts, images, data, manifest)
   ;; These are located in the root of the build output
   (nginx-location-configuration
    (uri "~* ^/(icons|fonts|data|favicon.svg|manifest.webmanifest)")
    (body '("proxy_pass http://127.0.0.1:8080;"
            "expires 30d;"
            "add_header Cache-Control \"public\";"
            "gzip_static on;")))
   )))
