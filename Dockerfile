FROM nginx:alpine
RUN rm -rf /usr/share/nginx/html/*
COPY html5up-massively/*.html /usr/share/nginx/html/
COPY html5up-massively/images/* /usr/share/nginx/html/images/
COPY html5up-massively/assets/css/* /usr/share/nginx/html/assets/css/
COPY html5up-massively/assets/js/* /usr/share/nginx/html/assets/js/
COPY html5up-massively/assets/webfonts/* /usr/share/nginx/html/assets/webfonts/
COPY html5up-massively/assets/sass/* /usr/share/nginx/html/assets/sass/
# Expose port 80 for HTTP traffic
EXPOSE 80

# Start Nginx in foreground mode (required for Docker)
CMD ["nginx", "-g", "daemon off;"]

