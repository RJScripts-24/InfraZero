# InfraZero

**Subtitle**: The AI-Native Collaborative Distributed Systems Laboratory  
**Tagline**: "Design with AI, Collaborate in Real-Time, Verify with Physics. No Backend Required."

## 1. Executive Summary
InfraZero is a "Local-First" Visual IDE designed to bridge the gap between abstract system design and concrete reliability engineering. Unlike traditional diagramming tools that produce static images, InfraZero allows teams to generate distributed system architectures using AI prompts, edit them collaboratively in real-time, and prove their reliability using a deterministic, browser-based, hardware-accelerated physics simulation engine. The platform creates a risk-free "sandbox" for students and engineers to subject their system designs to chaotic traffic patterns (e.g., "The Thundering Herd") to identify single points of failure before writing a single line of code.

## 2. Background
The transition to cloud-native architectures and microservices has dramatically increased system complexity. While modern organizations benefit from scalable and distributed computing, it has become increasingly challenging to foresee how these systems behave under stress or unexpected loads. Traditional approaches rely on static architecture diagrams (e.g., Visio, Lucidchart) which offer zero insight into runtime behavior, or on complex staging environments that are expensive and difficult to maintain. Engineers and students often learn about system failures "the hard way"—in production—because they lack a visually intuitive, zero-risk environment to model and test distributed systems dynamically.

## 3. Research Motivation and Problem Statement
**Motivation**: The drive behind InfraZero is to democratize Site Reliability Engineering (SRE) and distributed system design. There is a critical gap between theoretical architecture design and practical reliability testing. Current educational tools and ideation platforms treat architecture as static documents rather than living systems that process simulated network traffic.

**Problem Statement**: How can we create a cohesive, interactive environment that allows users to instantly generate complex distributed architectures and immediately validate their resilience against real-world chaos (like variable latency, cold starts, and single points of failure) without the overhead of provisioning physical cloud infrastructure? The challenge is to deliver a localized, deterministically simulated network directly within the browser, providing immediate feedback on architectural decisions before any infrastructure automation or backend code is written.

## 4. System Philosophy & Architecture

### A. The Three Layers
1. **Visual Layer (The Lens)**: Renders cloud-native iconography (AWS, GCP, etc.) to provide a familiar aesthetic for users interacting with the canvas.
2. **Logical Layer (The Engine)**: Uses provider-agnostic "Actor Models." Under the hood, a node is simply a stateful actor with properties like `processingPower` and `coldStartLatency`, cleanly decoupled from its visual counterpart.
3. **Runtime Layer (The Ghost)**: Ephemeral and client-side execution. Traffic data (current connections, queue depth) exists only during active simulations and is never persisted to the central database, keeping the core architectural definition pristine.

### B. Technical Stack
The project leverages a modern, highly performant stack ensuring smooth client-side rendering and deterministic execution:
- **Frontend Workspace**: Built on **React** and powered by **Vite** for rapid tooling. Uses **Tailwind CSS** and **Shadcn UI** for component styling, enriched by dynamic animations via **Framer Motion** and **GSAP**.
- **Canvas Engine**: Leveraging **React Flow (`@xyflow/react`)** for the infinite grid interface, providing optimized viewport management and node/edge interactions.
- **Backend API & Real-Time Sync**: A robust **Node.js/Express** backend written in **TypeScript**. Handles real-time syncing and messaging via **WebSockets (`ws`)**. **Supabase** acts as the primary data store and metadata hub. 
- **AI Logic Layer**: Integrates the **Groq API** (Llama 3) for instant text-to-graph AI generation, analyzing user prompts and synthesizing architectural nodes.
- **Physics Core (Simulation Engine)**: Engineered in **Rust** and compiled to **WebAssembly (WASM)**. It employs `wasm-bindgen`, `serde`, and `sha2` hashing to deliver near-native simulation speed that runs deterministically directly within the user's browser context.

## 5. Core Modules & Features

### Module 1: The Multiplayer AI-Native Canvas (The "Studio")
- **AI Co-Designer**: Text-to-graph generation. Users provide semantic prompts (e.g., "Build a Netflix-like microservices backend") to synthesize editable node graphs instantly.
- **Real-Time Sync**: Synchronizes canvases across multiple users in real-time, displaying "Live Cursors" and presence detection for peer-to-peer editing.
- **Context-Aware Editing**: The AI understands system topology natively and can intelligently insert components (e.g., injecting a Redis cache implicitly between a compute node and DB layer if requested).

### Module 2: The Deterministic Simulation Engine
- **WASM Physics**: The visual graph is compiled downstream into a high-performance Rust struct. Requests traverse the nodes realistically as "dots" along the edges.
- **Network Fidelity**: Edges are treated as primary computing entities with fully configurable simulation properties: `latency`, `jitter`, `packetLoss`, and `bandwidthLimit`.
- **Chaos Engineering**: Built-in fault injection ("Chaos Mode") allows operators to manually or randomly kill nodes on the fly to observe cascading system failure metrics.

### Module 3: The "Terminal" Ops Dashboard
- **DevOps Experience**: A functional bottom panel terminal mimics a real production console.
- **Live Logs**: Emits deterministic, real-time logs mirroring the state of the simulation (e.g., `[ERROR] Connection Refused: DB-Primary overloaded`).

### Module 4: Post-Mortem & Reporting
- **Automated Analysis**: Generates comprehensive reports after a simulation naturally completes or terminally crashes.
- **Grading System**: Programmatically assigns an "Architecture Grade" (A-F) based on dynamic stress thresholds and computes an "Estimated Cost Index" (ECI).
- **Root Cause Detection**: Flags the exact failure mode (e.g., "System failed due to aggressive retry logic causing a Retry Storm") in structured post-mortem telemetry.

## 6. Data Model (The "Source of Truth")
The data model is strictly typed to support a reproducible "Time Travel" undo mechanism:
- **The Graph Root**: Stabilized using robust `SHA256` hashing of the deterministic projection of nodes and edges. A shared hash ensures that multiple users rendering the same graph experience identically running simulations.
- **Node Schema**:
  - *Sim Config (Synced)*: `failureRate`, `recoveryTime`.
  - *Visuals (Synced)*: `x, y` coordinate space mapping, provider icon definition.
- **Universe Seed**: A consistent pseudo-random seed serialized with the graph. This guarantees identical network jitter reproduction across distinct client sessions during replay mode.

## 7. Application Workflow
Structured into 7 fundamental Core Pages:
1. **Landing Page**: Marketing, core feature breakdown, and primary application entry point.
2. **Authentication Portal**: Secure Role-Based Access Control and user identity logging.
3. **Dashboard**: Central workspace management hub to initiate, fork, or organize architecture graphs.
4. **Editor Workspace**: Main IDE environment containing the Canvas layout, AI Sidebar, and Terminal viewer.
5. **Simulation Report**: Dedicated output view for post-mortem analytics and deep-dive telemetry exports.
6. **Settings**: User theme mapping and layout preferences.
7. **Error Boundary**: Resilient localized fallbacks ensuring protection across broken links or missing state imports.

## 8. Research & Educational Value
- **Core Thesis**: Proving that System and Reliability Engineering can be democratized by combining LLM-powered architecture generation with robust client-side physics verification.
- **"Library of Doom"**: An integrated educational directory featuring pre-loaded, notoriously broken architectures (such as "The Thundering Herd" or unbound "Retry Storms"). It is intentionally designed to teach learners how to proactively discover and rectify real-world reliability anti-patterns.
