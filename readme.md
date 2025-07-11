# Coding Agent

A containerized web service that translates natural-language prompts into executable shell and GUI workflows using Docker, Node.js, and an LLM.

---

## 🚀 Overview

This project exposes a REST API that accepts user prompts, generates tool-formatted commands via Anthropic’s Claude model, and schedules them as sandboxed jobs inside Docker containers. It also supports headless GUI automation through Xvfb, Openbox, and x11vnc, enabling end-to-end automation of CLI and GUI tasks.

---

## ✨ Features

- **Natural-Language to Automation**: Convert plain English instructions into shell scripts, Python snippets, or GUI actions.
- **Job Orchestration**: Write, schedule, and execute jobs in isolated Docker runtimes with real-time status tracking and log retrieval.
- **Headless GUI Support**: Run GUI applications in-memory with Xvfb, manage windows with Openbox, and view/control via VNC.
- **Modular Endpoints**: Easily extendable REST API for adding new automation “tools.”
- **Downloadable Artifacts**: Bundle job outputs into tar archives for easy retrieval.

---

## 🏗 Architecture

```plaintext
┌────────────┐       ┌──────────────┐       ┌───────────────┐
│  Client    │ ───▶  │  Express.js  │ ───▶  │  Claude LLM   │
│ (curl/Postman)│      │  API Server  │      │  Integration │
└────────────┘       └──────────────┘       └───────────────┘
         │                     │                       │
         │                     ▼                       │
         │               ┌──────────┐                  │
         │               │  /agent  │                  │
         │               └──────────┘                  │
         │                     │                       │
         │                     ▼                       │
         │               ┌──────────┐                  │
         │               │ /schedule│                  │
         │               └──────────┘                  │
         │                     │                       │
         ▼                     ▼                       ▼
┌────────────┐         ┌──────────────┐       ┌────────────┐
│ Dockerized │◀──logs──│ Job Runner   │──files─▶│ Artifacts  │
│ Runtime    │         │ (scripts)    │        │  Archive   │
└────────────┘         └──────────────┘       └────────────┘
```

---

## 🛠️ Getting Started

### Prerequisites

- Docker Engine
- Node.js (v16+)
- Yarn or npm

### Installation

1. Clone the repo:

   ```bash
   git clone https://github.com/yourusername/coding-agent.git
   cd coding-agent
   ```

2. Build the Docker images:

   ```bash
   docker build -t coding-agent .
   ```

3. Start the services:

   ```bash
   docker run -it --rm -e ANTHROPIC_API_KEY="sk......." -p 8888:8888 -p 6080:6080 -p 3000:3000 -v /var/run/docker.sock:/var/run/docker.sock -v /tmp/coding-agent-jobs:/home/agentuser/agent-api/jobs coding-agent
   ```

---

## 🎯 API Endpoints

| Endpoint           | Method | Description                                        |
| ------------------ | ------ | -------------------------------------------------- |
| `/agent`           | POST   | Submit a natural-language prompt to generate a job |
| `/schedule`        | POST   | Schedule and execute the generated job             |
| `/status/:jobId`   | GET    | Retrieve the status and logs of a job              |
| `/jobs/:jobId`     | GET    | Download the raw job script                        |
| `/download/:jobId` | GET    | Download the job artifacts (tar.gz)                |
| `/shell`           | POST   | Execute ad-hoc shell commands                      |
| `/code/python`     | POST   | Run Python code snippets                           |
| `/xdot-agent`      | POST   | Perform GUI automation via xdotool                 |

---

## 📖 Usage Example

```bash
curl -X POST http://localhost:3000/agent \
     -H "Content-Type: application/json" \
     -d '{"prompt": "Install Node.js, clone my repo, and run tests."}'

# Returns jobId
curl http://localhost:3000/status/<jobId>

curl http://localhost:3000/download/<jobId> -o output.tar.gz
```

---

## 🤝 Contributing

Contributions are welcome! Please open issues or PRs against the `main` branch.

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature-name`).
3. Commit your changes (`git commit -m "Add feature"`).
4. Push to your branch (`git push origin feature-name`).
5. Open a Pull Request.

---
