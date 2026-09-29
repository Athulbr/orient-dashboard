# Use an official Node.js image as base
FROM node:22-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the app for production
RUN npm run build

# Expose the port that Vite's preview server will run on
EXPOSE 8080

# Command to start the Vite preview server
CMD ["npm", "run", "preview", "--", "--port", "8080", "--strictPort", "--host", "0.0.0.0"]
