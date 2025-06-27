# agent-runtime/Dockerfile
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install common tools and languages
RUN apt-get update && \
    apt-get install -y \
    bash \
    curl \
    wget \
    git \
    python3 \
    python3-pip \
    nodejs \
    npm \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install common Python packages
RUN pip3 install requests numpy pandas matplotlib seaborn

# Set working directory
WORKDIR /workspace

# Default command
CMD ["/bin/bash"]