#########################################
# Stage 1: Build
#########################################
FROM node:18.20.4-bullseye-slim AS builder

# Install build/runtime dependencies (Git, wkhtmltopdf, fonts, etc.)
RUN apt-get update && apt-get install -y \
    git \
    wget \
    fonts-powerline \
    wkhtmltopdf \
  && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Clone the ForwardEmail repository (or use your fork/branch)
RUN git clone https://github.com/forwardemail/forwardemail.net.git .

# Enable Corepack and prepare pnpm (as recommended by the project)
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install production dependencies (use --prod for a lean install)
RUN pnpm install --prod

# Build the assets (if your production setup requires a build step)
RUN pnpm run build

#########################################
# Stage 2: Production Image
#########################################
FROM node:18.20.4-bullseye-slim

# Install runtime dependencies (again, if needed at runtime)
RUN apt-get update && apt-get install -y \
    wget \
    fonts-powerline \
    wkhtmltopdf \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# Copy the built app from the builder stage
COPY --from=builder /app /app

# Expose all ports that might be used by the individual services
# (These can be overridden by docker-compose service definitions)
EXPOSE 3000 4000 2432 2525 2113 2115 3456 5000

# Default command – this will be overridden in docker-compose for each service
CMD ["pnpm", "start", "all"]
