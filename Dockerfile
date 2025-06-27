# Use Ubuntu as base
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies (NO Docker daemon)
RUN apt-get update && \
    apt-get install -y \
    xterm \
    python3 python3-pip \
    xvfb x11vnc xdotool openbox \
    supervisor curl git wget unzip net-tools \
    apt-transport-https ca-certificates gnupg lsb-release && \
    rm -rf /var/lib/apt/lists/*

# Install classic Firefox from Mozilla PPA (not snap)
RUN wget -qO - https://mozilla.debian.net/archive.asc | gpg --dearmor > /usr/share/keyrings/mozilla-archive-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/mozilla-archive-keyring.gpg] http://mozilla.debian.net/ stable-backports firefox-release" > /etc/apt/sources.list.d/mozilla-firefox.list && \
    apt-get update && \
    apt-get install -y firefox && \
    rm -rf /var/lib/apt/lists/*

# Install ONLY Docker CLI (not the daemon)
RUN curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null && \
    apt-get update && \
    apt-get install -y docker-ce-cli && \
    rm -rf /var/lib/apt/lists/*

# Install Node.js 20 via NodeSource
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install Jupyter
RUN pip3 install notebook

# Install noVNC + websockify
RUN mkdir -p /opt/novnc && \
    cd /opt/novnc && \
    git clone https://github.com/novnc/noVNC.git . && \
    git clone https://github.com/novnc/websockify.git

# Create a non-root user
RUN useradd -ms /bin/bash agentuser

# Copy application code and install npm dependencies (as root)
COPY ./agent-api /home/agentuser/agent-api
WORKDIR /home/agentuser/agent-api
RUN npm install

# Fix ownership so agentuser can read/write
RUN chown -R agentuser:agentuser /home/agentuser

# Create directory for jobs with proper permissions
RUN mkdir -p /home/agentuser/agent-api/jobs && \
    chown -R agentuser:agentuser /home/agentuser/agent-api/jobs

# Switch to non-root for runtime
USER agentuser
WORKDIR /home/agentuser

# Expose ports for Jupyter, VNC, and API
EXPOSE 8888 5901 6080 3000

# Switch back to root to install supervisor config
USER root
COPY ./supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Start only supervisord (Docker daemon runs on host)
CMD ["/usr/bin/supervisord"]











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


