FROM nginx:1.27-alpine

WORKDIR /server

COPY . /server/

RUN chmod +x /server/entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/server/entrypoint.sh"]
