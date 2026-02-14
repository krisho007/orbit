# Orbit API + Web UI Dockerfile
# Build from repo root: docker build -f apps/api/Dockerfile .

# ==================================
# Stage 1: Build Expo Web (Node for Metro, Bun for dependency resolution)
# ==================================
FROM node:20-slim AS web-builder

WORKDIR /build

# Install Bun for dependency resolution (handles peer deps correctly)
RUN npm install -g bun

# Build arguments for Expo (needed at build time for static rendering)
ARG EXPO_PUBLIC_SUPABASE_URL
ARG EXPO_PUBLIC_SUPABASE_ANON_KEY
ARG EXPO_PUBLIC_API_URL

# Set them as environment variables for the build
ENV EXPO_PUBLIC_SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL
ENV EXPO_PUBLIC_SUPABASE_ANON_KEY=$EXPO_PUBLIC_SUPABASE_ANON_KEY
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL

# Copy mobile app package files
COPY apps/mobile/package.json apps/mobile/bun.lock* ./

# Install dependencies with Bun (resolves peer deps properly)
RUN bun install --frozen-lockfile

# Copy mobile app source
COPY apps/mobile/ ./

# Build Expo Web (static export using Node/Metro)
ENV NODE_ENV=production
RUN npx expo export --platform web

# ==================================
# Stage 2: Production with Bun
# ==================================
FROM oven/bun:1-slim AS production

WORKDIR /app

# Install curl for health checks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy API package files and install
COPY apps/api/package.json apps/api/bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy API source code
COPY apps/api/src ./src
COPY apps/api/tsconfig.json ./

# Copy built Expo Web from builder stage
COPY --from=web-builder /build/dist ./public

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the server
CMD ["bun", "run", "src/index.ts"]
