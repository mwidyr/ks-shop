FROM golang:1.22-alpine AS build
WORKDIR /app
COPY go.mod ./
RUN go mod download 2>/dev/null || true
COPY . .
RUN go mod tidy && go build -o /server ./cmd/api

FROM alpine:3.19
WORKDIR /app
COPY --from=build /server /app/server
EXPOSE 8080
CMD ["/app/server"]
