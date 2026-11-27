FROM nginx:1.31-alpine

WORKDIR /server
# certificate.sh's placeholder, for TLS__TERMINATION=self, needs the openssl CLI, which the image lacks.
RUN apk add --no-cache openssl
COPY . /server/

RUN chmod +x /server/entrypoint.sh /server/certificate.sh

EXPOSE 80 443
ENTRYPOINT ["/server/entrypoint.sh"]
