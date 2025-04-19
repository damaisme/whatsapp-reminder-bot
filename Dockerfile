# Use Node.js LTS version
FROM node:22-alpine

# Create app directory
WORKDIR /usr/src/app

# Install system dependencies including Chromium for WhatsApp Web
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    tzdata \
    git

# Set timezone
ENV TZ=Asia/Jakarta
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Set Chrome flags for running in container
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy package files
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy app source
COPY . .

# Create necessary directories and set permissions
RUN mkdir -p \
    /usr/src/app/data \
    /usr/src/app/auth_info_baileys \
    && chown -R node:node /usr/src/app

# Switch to non-root user
USER node

# Start the bot
CMD ["npm", "start"] 
