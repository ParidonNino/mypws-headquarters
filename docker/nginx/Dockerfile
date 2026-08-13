# TLS-terminating reverse proxy for local development only.
#
# Optional: only built and run via the "proxy" compose profile. Plain
# `docker compose up` does not involve this image at all.
#
# nginx:alpine ships without openssl, which the entrypoint needs to generate a
# self-signed certificate on first start.
FROM nginx:alpine

RUN apk add --no-cache openssl

COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY docker/nginx/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 443

ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
