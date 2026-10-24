# Garage's image has no shell for the entrypoint, so its static binary is copied onto alpine.
FROM dxflrs/garage:v2.4.1 AS garage

FROM alpine:3.22

COPY --from=garage /garage /usr/local/bin/garage
COPY entrypoint.sh /usr/local/bin/entrypoint.sh

RUN adduser -D -H garage \
    && mkdir -p /var/lib/garage/meta /var/lib/garage/data \
    && chown -R garage:garage /var/lib/garage

USER garage
ENV GARAGE_CONFIG_FILE=/tmp/garage.toml
EXPOSE 3900
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
