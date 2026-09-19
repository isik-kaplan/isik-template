# Only ever brought up by the e2e overlay - the app is otherwise not servable at localhost (see
# README), so the containers running the browser and the app itself need a domain resolver of
# their own rather than relying on a host machine's real DNS or /etc/hosts.
FROM alpine:3.20

RUN apk add --no-cache dnsmasq

COPY dnsmasq.conf /etc/dnsmasq.conf

EXPOSE 53/udp 53/tcp

CMD ["dnsmasq", "-k", "--log-facility=-"]
