# 5. Functional Requirements for the Prototype (Major Project-Phase 1)

**Project:** InfraZero

For the Major Project-Phase 1 scope, the implemented functional requirements are focused on the primary success use cases that demonstrate the core capabilities of the InfraZero platform: AI-driven architecture generation, interactive visual editing, and fundamental browser-based physics simulation.

## Functional Requirements Table

| Req ID | Functional Requirement (SMART compliant) | Expected Outcome |
| :--- | :--- | :--- |
| **FR1** | The system shall allow users to generate a basic system architecture graph consisting of at least 3 nodes (e.g., Client, Server, Database) using a single text-based AI prompt within 10 seconds. | A visual, interactive graph representing the requested architecture is accurately rendered on the canvas. |
| **FR2** | The system shall enable users to manually drag, drop, and connect node components (e.g., compute, database, cache) on the canvas to visually construct or modify the system architecture. | Nodes are successfully placed on the canvas and connected via edges, updating the underlying graph data structure in real-time. |
| **FR3** | The system shall provide a deterministic simulation execution mode where users can trigger simulated traffic that visually traverses the connected edges from source to destination nodes. | Animated "request dots" successfully flow along the edges between connected nodes to demonstrate system traffic routing. |
| **FR4** | The system shall allow users to manually mark a specific node as "failed" (Chaos Mode) during an active simulation to observe traffic behavior. | Traffic routed to the 'failed' node is visually dropped or blocked, generating a basic failure event in the simulation log. |

## 6. Proposed Methodology for Building Prototype (Major Project-Phase 1)
This section outlines the step-by-step approach and system design for developing the InfraZero platform. As a web-based, AI-native Visual IDE, the focus is entirely on a robust software stack and distributed architecture rather than physical sensors or microcontrollers.

### System Architecture / Block Diagram
The system architecture consists of a highly responsive frontend client, a real-time sync server, and an AI generation layer. 
- **Client (Browser)**: React Application + WASM Physics Engine. Manages the visual canvas and local deterministic simulation.
- **Real-Time Sync**: Node.js/Express Server using WebSockets (`ws`) to relay state and cursor positions among connected users.
- **Data Persistence**: Supabase (PostgreSQL) acting as the central truth for project metadata, users, and saved graph states.
- **AI Engine**: External Groq API (Llama 3) for text-to-graph synthesis.

### Workflow / Process Steps
1. **Input**: User submits a natural language architecture prompt (e.g., "Web app with a load balancer and 3 DB replicas").
2. **AI Processing**: The Groq API processes the prompt and returns a structured JSON map of nodes and edges.
3. **Canvas Rendering**: React Flow ingests the JSON and renders the interactive drag-and-drop workspace.
4. **User Modification**: The user manually tweaks the graph, with changes synchronized via WebSockets to other collaborating users.
5. **Simulation Execution**: Upon triggering a simulation run, the graph state is passed to the WebAssembly (Rust) Core.
6. **Output**: The WASM core deterministically calculates traffic physics (latency, packet loss) and outputs visual telemetry and localized logs back to the React UI in real-time.

### Hardware Used
As a purely software-based SaaS web application, InfraZero does not utilize dedicated embedded hardware (like Arduino or Raspberry Pi). It is designed to run on standard consumer hardware (desktops, laptops) equipped with modern web browsers capable of WebAssembly execution.

### Software and Programming Tools
- **Frontend Layer**: React.js, Vite, Tailwind CSS, Shadcn UI, React Flow (`@xyflow/react`), Framer Motion.
- **Backend & Network Layer**: Node.js, Express, TypeScript, WebSockets (`ws`).
- **Database Layer**: Supabase (PostgreSQL).
- **Simulation Layer**: Rust compiling to WebAssembly (WASM), utilizing `wasm-bindgen`.
- **AI Integration**: Groq API (Llama 3 model).

### Algorithms or Techniques Implemented
- **Deterministic Simulation Engine**: A custom physics algorithm written in Rust to locally simulate network queue depths, jitter, bandwidth limitations, and probabilistic node failure rates.
- **Generative Graph Synthesis**: Leveraging Large Language Models (LLM) to intelligently map semantic language into strictly typed topological graphs (Nodes and Edges).
- **State Hashing**: SHA256 hashing algorithms map projection states deterministically, ensuring that multi-player simulations execute identically across distinct browser clients.

## 7. GitHub Repository Details
- **Repository Link**: [https://github.com/rkj24/InfraZero](https://github.com/rkj24/InfraZero)  *(Note: Adjust URL if hosted under a different organization or username)*
- **Contents Included**: 
  - Source code for the Frontend React application (`/frontend`).
  - Source code for the Node.js/WebSocket Backend (`/backend`).
  - Source code for the Rust/WASM Simulation Engine (`/physics-engine`).
  - Project documentation, setup scripts, and simulation scenario datasets.
