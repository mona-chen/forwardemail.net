# Use an official Node runtime as a parent image
FROM node:18-alpine

# Install Git (needed to clone the repository)
RUN apk add --no-cache git

# Set the working directory
WORKDIR /app

# Clone the forwardemail.net repository
RUN git clone https://github.com/forwardemail/forwardemail.net.git .

# Install app dependencies
RUN npm install

# Build the application (if the repo supports a build step; if not, you can remove this)
RUN npm run build

# Expose the port (adjust if the app uses a different port)
EXPOSE 3000

# Define environment variable (can be overridden by docker-compose)
ENV NODE_ENV=production
ENV PORT=3000

# Run the app when the container starts
CMD ["npm", "start"]
