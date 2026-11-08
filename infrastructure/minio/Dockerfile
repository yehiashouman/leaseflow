FROM golang:1.25-alpine AS build
ENV CGO_ENABLED=0 GOTOOLCHAIN=local
# The community image is no longer public; preserve the required local service from official source.
RUN go install -p 2 github.com/minio/minio@9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata
COPY --from=build /go/bin/minio /usr/local/bin/minio
COPY --from=build /go/pkg/mod/github.com/minio/minio@*/LICENSE /usr/share/licenses/minio/LICENSE
LABEL org.opencontainers.image.source="https://github.com/minio/minio" \
      org.opencontainers.image.revision="9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a" \
      org.opencontainers.image.licenses="AGPL-3.0-only"
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
