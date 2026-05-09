# Stage 1: Build
FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

# Pass git info if needed (Vite config already handles this via execSync, 
# but we need git installed in the build stage for that to work)
RUN apt-get update && apt-get install -y git && apt-get clean
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Custom nginx config to handle SPA routing if needed 
# (though currently you have index.html and about.html as separate files)
# COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
