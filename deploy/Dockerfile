# Multi-stage build: Node (frontend) → Go (backend) → distroless runtime

# Stage 1: Build frontend
FROM node:22-alpine AS frontend
WORKDIR /app/web
COPY web/package.json web/package-lock.json* ./
RUN npm ci --ignore-scripts
COPY web/ .
RUN node build.mjs

# Stage 2: Build Go binary
FROM golang:1.24-alpine AS backend
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /app/web/dist ./web/dist
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /agemail ./cmd/agemail

# Stage 3: Minimal runtime
FROM gcr.io/distroless/static:nonroot
COPY --from=backend /agemail /agemail
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/agemail"]
