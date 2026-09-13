# ✈️ TripMate AI — Multi-Agent Travel Planner

[![Python Version](https://img.shields.io/badge/Python-3.11%2B-blue.svg?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.136-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![LangGraph](https://img.shields.io/badge/LangGraph-1.2.2-orange.svg?logo=langchain&logoColor=white)](https://langchain-ai.github.io/langgraph/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-Protocol-purple.svg)](https://modelcontextprotocol.io/)
[![Groq](https://img.shields.io/badge/Groq-Cloud-f55036.svg)](https://groq.com/)
[![Neon PostgreSQL](https://img.shields.io/badge/Neon-PostgreSQL-00E599.svg?logo=postgresql&logoColor=white)](https://neon.tech/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**TripMate AI** is a production-grade, autonomous travel planning system built on **LangGraph**, **FastAPI**, and the **Model Context Protocol (MCP)**. It coordinates specialized autonomous agents to research live flights, hotels, real-time weather forecasts, calculate realistic budgets, and craft comprehensive day-by-day itineraries with Human-in-the-Loop (HITL) approval and persistent checkpointing in Neon PostgreSQL.

---

## 📑 Table of Contents

- [Key Features](#-key-features)
- [System Architecture & Evolution](#-system-architecture--evolution)
  - [Part 1: Simple Sequential Architecture (Without MCP)](#part-1-simple-sequential-architecture-without-mcp)
  - [Part 2: Tool-Augmented Architecture (Using MCP)](#part-2-tool-augmented-architecture-using-mcp)
  - [Part 3: Enterprise Multi-Agent System (Supervisor + Guardrails + HITL)](#part-3-enterprise-multi-agent-system-supervisor--guardrails--hitl)
- [Specialized Agents Breakdown](#-specialized-agents-breakdown)
- [Model Context Protocol (MCP) Integration](#-model-context-protocol-mcp-integration)
- [Repository Structure](#-repository-structure)
- [Setup & Installation Guide](#-setup--installation-guide)
  - [Prerequisites](#prerequisites)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Virtual Environment Setup](#2-virtual-environment-setup)
  - [3. Install Dependencies](#3-install-dependencies)
  - [4. Environment Variables Configuration](#4-environment-variables-configuration)
  - [5. Run the Application](#5-run-the-application)
- [API Reference](#-api-reference)
- [Docker & Cloud Deployment](#-docker--cloud-deployment)
- [PDF & Print Engine](#-pdf--print-engine)

---

## 🌟 Key Features

- 🧠 **Dynamic Supervisor Orchestration**: An intelligent supervisor node analyzes user intent and dynamically routes execution only to required specialist agents, eliminating redundant API calls.
- 🛡️ **Input Guardrails**: Evaluates user prompts before execution to block off-topic or malicious inputs with user-friendly explanations.
- 👤 **Human-in-the-Loop (HITL) Approval**: LangGraph `interrupt()` pauses graph execution after drafting the itinerary and budget, allowing the user to review, approve, or request revisions.
- 🔌 **Model Context Protocol (MCP)**: Uses MCP Stdio transport for real-time tool calling:
  - Custom OpenWeatherMap MCP server for live weather and multi-day forecasts.
  - AviationStack MCP adapter for real-time flight route data.
  - Tavily Search MCP adapter for live hotel rates and attractions.
- 💾 **Stateful Checkpointing**: Backed by **Neon Serverless PostgreSQL** via `PostgresSaver`, enabling persistent session memory, conversation threads, and flawless workflow resumption across browser refreshes.
- ⚡ **Ultra-Fast LLM Inference**: Powered by **Groq** high-throughput inference engine (supports `openai/gpt-oss-120b`, `qwen/qwen3.8-27b`, and other Groq models).
- 📄 **Clean PDF & Print Engine**: Built-in responsive A4 auto-pagination that prevents awkward row slicing, prevents blank pages, and fits dense multi-column tables cleanly.

---

## 🏗️ System Architecture & Evolution

The architecture of TripMate AI evolved across three distinct architectural milestones:

### Part 1: Simple Sequential Architecture (Without MCP)

In the initial architecture, agents ran in a static sequential pipeline using hardcoded LLM prompts without external live data or dynamic decision-making.

![Part 1: Simple Architecture Without MCP](assets/part1_architecture_simple.png)

- **Execution Flow**: `User Input` ➔ `Flight Agent` ➔ `Hotel Agent` ➔ `Weather Agent` ➔ `Itinerary Agent` ➔ `Output`.
- **Limitations**: No live data, fixed execution order regardless of user intent, and no human feedback mechanism.

---

### Part 2: Tool-Augmented Architecture (Using MCP)

The second version connected agents to external real-world systems using the **Model Context Protocol (MCP)** client-server paradigm via standardized Stdio transport.

![Part 2: Using Model Context Protocol (MCP)](assets/part2_architecture_mcp.png)

- **Enhancements**:
  - `AviationStack MCP Server` for live flight routes and schedules.
  - `Tavily Search MCP Server` for live web search and current hotel pricing.
  - `Custom Weather MCP Server` powered by FastMCP and OpenWeatherMap API.
- **Capabilities**: Agents now query real-time external data while maintaining isolation between tool servers and LLM reasoning.

---

### Part 3: Enterprise Multi-Agent System (Supervisor + Guardrails + HITL)

The production architecture implements an autonomous multi-agent graph with guardrails, supervisor routing, budget analysis, Human-in-the-Loop approval, and PostgreSQL checkpoint persistence.

![Part 3: Supervisor Agent + Guardrails + HITL](assets/part3_architecture_supervisor_hitl.png)

- **Comprehensive Control**:
  1. **Input Guardrail**: Validates travel relevance.
  2. **Supervisor Agent**: Deconstructs query constraints and plans the exact agent sequence.
  3. **Specialist Agents**: Queries flights, accommodations, weather forecasts, and calculates total budget breakdown.
  4. **Approval Interruption (HITL)**: Pauses execution with `interrupt()`, presenting a draft itinerary and cost breakdown to the user.
  5. **Resume / Revise**: If approved, finalizes the plan; if revised, incorporates feedback back into the synthesis node.
  6. **Neon Postgres Checkpointer**: Automatically captures state transitions per `thread_id`.

---

## 🤖 Specialized Agents Breakdown

| Agent Name | Function & Purpose | Tools / MCP Used |
| :--- | :--- | :--- |
| **🛡️ Input Guardrail** | Validates that requests are travel-related and safe before invoking any downstream LLMs. | Zero-shot intent classification via Groq |
| **🧠 Supervisor Router** | Extracts destination, duration, budget constraints, and selects which specialist agents need to run. | JSON constraint parsing & routing heuristics |
| **✈️ Flight Agent** | Finds airline options, routes, typical layovers, and airport-to-city transfers. | AviationStack MCP + Airport IATA lookup |
| **🏨 Hotel Agent** | Researches 3-star, boutique, or budget accommodations with location perks. | Tavily Search MCP |
| **🌦️ Weather Agent** | Fetches live climate conditions, temperatures, and packing suggestions. | Custom Weather FastMCP + OpenWeatherMap |
| **💰 Budget Agent** | Audits overall costs, breaks down categories (flights, stays, food, buffer), and warns of overruns. | Budget analytical modeling |
| **👤 Approval Agent (HITL)** | Pauses workflow execution using LangGraph `interrupt()`, awaiting user approval or revision notes. | StateGraph Interrupt mechanism |
| **🗓️ Itinerary Agent** | Synthesizes all researched data into an actionable, day-by-day travel itinerary with tables. | Multi-modal context synthesis |

---

## 🔌 Model Context Protocol (MCP) Integration

TripMate AI uses the standard **MCP Python SDK** (`mcp`) and `langchain-mcp-adapters` to communicate with MCP servers over standard input/output (Stdio).

```
                      ┌────────────────────────────────────────┐
                      │            TripMate Backend            │
                      │               (FastAPI)                │
                      └───────────────────┬────────────────────┘
                                          │ Stdio Transport
                  ┌───────────────────────┼───────────────────────┐
                  ▼                       ▼                       ▼
      ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
      │  Weather MCP Server  │ │  Tavily Search MCP   │ │   AviationStack MCP  │
      │   (FastMCP Server)   │ │       Adapter        │ │       Adapter        │
      └──────────┬───────────┘ └──────────┬───────────┘ └──────────┬───────────┘
                 ▼                        ▼                        ▼
        OpenWeatherMap API            Tavily API           AviationStack API
```

### Custom Weather MCP Server (`custom_weather_mcp_server.py`)
Implements two tool endpoints using FastMCP:
1. `get_current_weather(city, country_code)`: Live temperature, humidity, and weather conditions.
2. `get_weather_forecast(city, country_code)`: 5-day forecast with 3-hour intervals for seasonal packing advice.

---

## 📁 Repository Structure

```plaintext
Multi-Agent-System/
├── assets/                               # Architectural diagrams & screenshots
│   ├── part1_architecture_simple.png     # Stage 1: Basic Sequential Diagram
│   ├── part2_architecture_mcp.png        # Stage 2: MCP Integration Diagram
│   └── part3_architecture_supervisor_hitl.png # Stage 3: Supervisor + HITL Diagram
├── static/                               # Frontend styles & client scripts
│   ├── script.js                         # Web interaction, API calls, PDF generator
│   └── style.css                         # Dark-mode styling, responsive & print CSS
├── templates/
│   └── index.html                        # Web UI with workflow visualizer & HITL modal
├── app.py                                # FastAPI application entry point
├── backend.py                            # LangGraph StateGraph, supervisor, agents, HITL
├── custom_weather_mcp_server.py          # FastMCP Stdio server for OpenWeatherMap
├── mcp_client.py                         # MCP client helper adapters (Weather, Flights, Tavily)
├── demo.excalidraw                       # Raw Excalidraw design file
├── Dockerfile                            # Production container specification
├── render.yaml                           # Cloud deployment configuration for Render
├── requirements.txt                      # Project dependencies pinned for stability
├── .env.example                          # Sample environment configuration template
└── README.md                             # Project documentation
```

---

## 🚀 Setup & Installation Guide

### Prerequisites
- **Python 3.11+** installed ([python.org](https://www.python.org/downloads/)).
- **Git** installed ([git-scm.com](https://git-scm.com/)).
- API Keys:
  - [Groq Console](https://console.groq.com/) (Fast LLM inference)
  - [Neon Serverless PostgreSQL](https://console.neon.tech/) (Checkpointer database)
  - [Tavily Search](https://app.tavily.com/) (Live web research)
  - [OpenWeatherMap](https://home.openweathermap.org/api_keys) (Weather forecasts)
  - [AviationStack](https://aviationstack.com/) (Flight route data)

---

### 1. Clone the Repository

```bash
git clone https://github.com/srijan300/Multi-Agent-System.git
cd Multi-Agent-System
```

### 2. Virtual Environment Setup

**Windows (PowerShell):**
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

**macOS / Linux:**
```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

---

### 4. Environment Variables Configuration

Copy `.env.example` to create your local `.env`:

```bash
cp .env.example .env
```

Open `.env` and fill in your credentials:

```ini
# =========================================================
# TripMate AI - Environment Configuration
# =========================================================

# Groq LLM Configuration
GROQ_MODEL="openai/gpt-oss-120b"
GROQ_API_KEY="gsk_your_groq_api_key_here"

# OpenWeatherMap API Key (used by custom_weather_mcp_server.py)
OPENWEATHER_API_KEY="your_openweather_api_key_here"

# AviationStack API Key (used by aviationstack MCP adapter)
AVIATIONSTACK_API_KEY="your_aviationstack_api_key_here"

# Default departure airport (e.g. CCU, DEL, BOM, JFK, LHR)
DEFAULT_ORIGIN_IATA="CCU"
DEFAULT_ORIGIN="Kolkata"

# Tavily API Key (used by Tavily MCP search adapter)
TAVILY_API_KEY="tvly-your_tavily_api_key_here"

# Neon PostgreSQL Database Connection URL (for state checkpointing)
DATABASE_URL="postgresql://user:password@ep-sample-pooler.neon.tech/neondb?sslmode=require"

# Custom Weather MCP Server Script Path
# Absolute path to custom_weather_mcp_server.py
WEATHER_SERVER_PATH="C:\\Users\\pauls\\OneDrive\\Desktop\\Multi-Agent-System\\custom_weather_mcp_server.py"

# LangSmith Observability (Optional)
LANGSMITH_TRACING="false"
LANGSMITH_ENDPOINT="https://api.smith.langchain.com"
LANGSMITH_API_KEY=""
LANGSMITH_PROJECT="TripMate-AI"
```

---

### 5. Run the Application

Start the local FastAPI application:

```bash
python app.py
```

Once started, navigate to:
👉 **[http://127.0.0.1:8000](http://127.0.0.1:8000)**

---

## 📡 API Reference

### 1. Plan Trip (Initial Request or Follow-up)
- **Endpoint**: `POST /api/travel`
- **Payload**:
  ```json
  {
    "message": "Plan a 7-day budget trip to Tokyo from Kolkata for October.",
    "thread_id": "optional-uuid"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "thread_id": "49547d79-...",
    "requires_approval": true,
    "itinerary": "### Draft Itinerary...",
    "approval_request": "Approve the draft or provide feedback before the final plan is generated.",
    "supervisor_reasoning": "Selected flight, hotel, weather, and budget agents.",
    "selected_agents": ["flight_agent", "hotel_agent", "weather_agent", "budget_agent", "itinerary_agent"],
    "guardrail_allowed": true
  }
  ```

### 2. Human-in-the-Loop Review
- **Endpoint**: `POST /api/travel/approve`
- **Payload**:
  ```json
  {
    "thread_id": "49547d79-...",
    "approved": true,
    "feedback": ""
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "thread_id": "49547d79-...",
    "answer": "# Complete Verified Travel Itinerary...",
    "requires_approval": false
  }
  ```

### 3. Health Check
- **Endpoint**: `GET /health`
- **Response**:
  ```json
  {
    "status": "ok",
    "message": "TripMate AI API is running",
    "features": ["supervisor_agent", "input_guardrail", "human_in_the_loop"]
  }
  ```

---

## 🐳 Docker & Cloud Deployment

### Run with Docker

Build and run the containerized application:

```bash
docker build -t tripmate-ai .
docker run -p 8000:8000 --env-file .env tripmate-ai
```

### Deploy to Render

The repository includes a ready-to-use [`render.yaml`](render.yaml) blueprint:
1. Push the repository to GitHub.
2. Link the repository to [Render.com](https://render.com/).
3. Add your environment variables in the Render dashboard.
4. Deploy as a Web Service!

---

## 🖨️ PDF & Print Engine

TripMate AI includes an automated PDF generation layout:
- **Zero Horizontal Clipping**: Tables automatically wrap content with `word-break` and compact padding, fitting comfortably on A4 paper (190mm printable width).
- **Intelligent Page Breaks**: Removed blanket `avoid-all` mode; table rows (`tr`) and headers (`h1-h3`) use `page-break-inside: avoid` and `page-break-after: avoid`, eliminating awkward text splitting and giant empty gaps.
- **Dual Export Options**:
  - Click **Download PDF** for an instant client-rendered `.pdf` download via `html2pdf.js`.
  - Click **Print** to open the browser's native print preview with vector text fidelity and repetition of table headers (`thead`).

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.

---

## 🤝 Contributing & Acknowledgments

Contributions, issues, and feature requests are welcome! Built with:
- [LangChain & LangGraph](https://github.com/langchain-ai/langgraph)
- [Anthropic Model Context Protocol](https://github.com/modelcontextprotocol)
- [Groq High-Speed Inference](https://groq.com/)
- [Neon Serverless PostgreSQL](https://neon.tech/)