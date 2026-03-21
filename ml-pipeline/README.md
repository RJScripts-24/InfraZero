# InfraZero ML Pipeline

## Setup

1. Install Python dependencies:
   cd scraper && pip install -r requirements.txt
   cd ../ghosttrace && pip install -r requirements.txt

2. Install Node dependencies (for synthetic data generation):
   npm install

3. Create your environment file:
   cp .env.example .env
   Then open .env and paste your GitHub token into GITHUB_TOKEN=

   To get a GitHub token:
   - Go to github.com -> Settings -> Developer settings
   - Personal access tokens -> Tokens (classic) -> Generate new token
   - Select scope: public_repo only
   - Copy the token and paste it into .env

## Running the Full Pipeline

Step 1 -- Generate synthetic labeled graphs:
   node collect/generate_dataset.js

Step 2 -- Scrape real architecture diagrams from GitHub:
   python scraper/scrape_github.py

Step 3 -- Parse .excalidraw files into graph JSON:
   python scraper/parse_excalidraw.py

Step 4 -- Label all graphs with anomaly classes:
   python scraper/label_graphs.py

Step 5 -- Augment the dataset:
   python scraper/augment_graphs.py

Step 6 -- Train the GNN model:
   python ghosttrace/graph_encoder.py

Step 7 -- Generate synthetic OTel traces:
   python ghosttrace/trace_synthesizer.py

## Output Locations
- Raw scraped files:   data/raw/
- Graph JSONs:         data/graphs/
- OTel traces:         data/traces/
- Trained model:       ghosttrace/ghosttrace_gnn.pt

## Notes
- Never commit your .env file or the data/ directory
- The trained model (ghosttrace_gnn.pt) is also gitignored - regenerate it locally
- For the research paper evaluation, also download TrainTicket and DeathStarBench
  from GitHub and place their architecture JSONs into data/graphs/ before Step 4
