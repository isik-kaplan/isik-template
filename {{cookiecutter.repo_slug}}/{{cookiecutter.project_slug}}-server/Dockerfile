FROM nginx:1.27-alpine

WORKDIR /server
{% if cookiecutter.tls_termination == "self" %}
# certificate.sh's placeholder needs the openssl CLI, which the image lacks.
RUN apk add --no-cache openssl
{% endif %}
COPY . /server/

RUN chmod +x /server/entrypoint.sh{% if cookiecutter.tls_termination == "self" %} /server/certificate.sh{% endif %}

EXPOSE 80
{% if cookiecutter.tls_termination == "self" %}
EXPOSE 443
{% endif %}
ENTRYPOINT ["/server/entrypoint.sh"]
