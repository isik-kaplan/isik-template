FROM nginx:1.27-alpine

WORKDIR /server
{% if cookiecutter.tls_termination == "self" %}
# Alpine's nginx image doesn't carry the openssl CLI by itself (only the libs nginx links
# against) - certificate.sh's own placeholder certificate needs the binary.
RUN apk add --no-cache openssl
{% endif %}
COPY . /server/

RUN chmod +x /server/entrypoint.sh{% if cookiecutter.tls_termination == "self" %} /server/certificate.sh{% endif %}

EXPOSE 80
{% if cookiecutter.tls_termination == "self" %}
EXPOSE 443
{% endif %}
ENTRYPOINT ["/server/entrypoint.sh"]
