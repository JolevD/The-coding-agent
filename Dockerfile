# Use Debian - no snap headaches
FROM debian:bookworm

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Create user early to avoid permission issues
RUN useradd -ms /bin/bash agentuser

# Install everything we need in one optimized layer
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    xterm firefox-esr \
    python3 python3-pip \
    xvfb x11vnc xdotool openbox \
    supervisor curl git wget unzip net-tools \
    apt-transport-https ca-certificates gnupg lsb-release \
    nodejs npm imagemagick && \
    # Install Docker CLI in same layer
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null && \
    apt-get update && \
    apt-get install -y --no-install-recommends docker-ce-cli && \
    # Install Python packages
    pip3 install --no-cache-dir --break-system-packages notebook && \
    # Install noVNC + websockify in same layer
    mkdir -p /opt/novnc && \
    cd /opt/novnc && \
    git clone --depth 1 https://github.com/novnc/noVNC.git . && \
    git clone --depth 1 https://github.com/novnc/websockify.git && \
    # Clean up all package manager caches and temporary files
    apt-get autoremove -y && \
    apt-get autoclean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* && \
    # Clean git cache
    rm -rf /opt/novnc/.git /opt/novnc/websockify/.git && \
    # Create necessary directories
    mkdir -p /home/agentuser/agent-api/jobs && \
    chown -R agentuser:agentuser /home/agentuser

# Copy package.json first for better layer caching
COPY --chown=agentuser:agentuser ./agent-api/package*.json /home/agentuser/agent-api/

# Switch to user for npm install
USER agentuser
WORKDIR /home/agentuser/agent-api

# Install npm dependencies with optimizations
RUN npm ci --only=production --no-audit --no-fund && \
    npm cache clean --force

# Copy application code (this should be after npm install for better caching)
COPY --chown=agentuser:agentuser ./agent-api /home/agentuser/agent-api

# Switch back to root for final setup
USER root

# Copy supervisor config
COPY ./supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Set working directory
WORKDIR /home/agentuser

# Expose ports
EXPOSE 8888 5901 6080 3000

# Start supervisor
CMD ["/usr/bin/supervisord"]







































# Use Debian - no snap headaches
# FROM debian:bookworm

# ENV DEBIAN_FRONTEND=noninteractive

# # Install everything we need in one go
# RUN apt-get update && \
#     apt-get install -y \
#     xterm firefox-esr \
#     python3 python3-pip \
#     xvfb x11vnc xdotool openbox \
#     supervisor curl git wget unzip net-tools \
#     apt-transport-https ca-certificates gnupg lsb-release nodejs npm imagemagick && \
#     rm -rf /var/lib/apt/lists/*

# # Install Docker CLI
# RUN curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg && \
#     echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null && \
#     apt-get update && \
#     apt-get install -y docker-ce-cli && \
#     rm -rf /var/lib/apt/lists/*

# # Install Jupyter
# RUN pip3 install --break-system-packages notebook

# # Install noVNC + websockify
# RUN mkdir -p /opt/novnc && \
#     cd /opt/novnc && \
#     git clone https://github.com/novnc/noVNC.git . && \
#     git clone https://github.com/novnc/websockify.git

# # Create user and setup
# RUN useradd -ms /bin/bash agentuser

# # Copy application code
# COPY ./agent-api /home/agentuser/agent-api
# WORKDIR /home/agentuser/agent-api
# RUN npm install && chown -R agentuser:agentuser /home/agentuser

# # Create jobs directory
# RUN mkdir -p /home/agentuser/agent-api/jobs && \
#     chown -R agentuser:agentuser /home/agentuser/agent-api/jobs

# USER agentuser
# WORKDIR /home/agentuser

# EXPOSE 8888 5901 6080 3000

# USER root
# COPY ./supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# CMD ["/usr/bin/supervisord"]








# # Use Ubuntu as base
# FROM ubuntu:22.04

# ENV DEBIAN_FRONTEND=noninteractive

# # Install system dependencies
# RUN apt-get update && \
#     apt-get install -y \
#     xterm \
#     python3 python3-pip \
#     xvfb x11vnc xdotool openbox \
#     supervisor curl git wget unzip net-tools firefox && \
#     rm -rf /var/lib/apt/lists/*

# # Install Node.js 20 via NodeSource
# RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
#     apt-get install -y nodejs

# # Install Jupyter
# RUN pip3 install notebook

# # Install noVNC + websockify
# RUN mkdir -p /opt/novnc && \
#     cd /opt/novnc && \
#     git clone https://github.com/novnc/noVNC.git . && \
#     git clone https://github.com/novnc/websockify.git

# # Create a non-root user
# RUN useradd -ms /bin/bash agentuser

# # Copy application code and install npm dependencies (as root)
# COPY ./agent-api /home/agentuser/agent-api
# WORKDIR /home/agentuser/agent-api
# RUN npm install

# # Fix ownership so agentuser can read/write
# RUN chown -R agentuser:agentuser /home/agentuser

# # Switch to non-root for runtime
# USER agentuser
# WORKDIR /home/agentuser

# # Expose ports for Jupyter, VNC, and API
# EXPOSE 8888 5901 6080 3000

# # Do NOT COPY .env into the image. 
# # Instead, at runtime supply it via --env-file or -e:
# #   docker run --rm --env-file .env -p 3000:3000 coding-agent

# # Switch back to root to install supervisor config
# USER root
# COPY ./supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# # Start all services under supervisord
# CMD ["/usr/bin/supervisord"]


