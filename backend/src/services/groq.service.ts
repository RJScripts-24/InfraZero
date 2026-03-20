// backend/src/services/groq.service.ts
import Groq from 'groq-sdk';
import { env } from '../config/env';
import { VALID_NODE_TYPES } from '../config/constants';
import { GraphTopology } from '../types/graph';
import { logger } from '../utils/logger';

// Initialize the Groq client using the validated environment variable
const groq = new Groq({ apiKey: env.GROQ_API_KEY });

const GROQ_MODEL_CANDIDATES = [
  process.env.GROQ_MODEL,
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'mixtral-8x7b-32768',
].filter((model): model is string => Boolean(model && model.trim()));

const createCompletionWithFallback = async (request: Omit<any, 'model'>): Promise<any> => {
  const tried: string[] = [];
  let lastError: unknown = null;

  for (const model of GROQ_MODEL_CANDIDATES) {
    try {
      tried.push(model);
      return await groq.chat.completions.create({ ...(request as any), model } as any);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[Groq Service] Model '${model}' failed: ${message}`);
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`All Groq models failed (${tried.join(', ')}): ${reason}`);
};

/**
 * Calls the Groq Llama 3 API to generate a distributed system architecture
 * based on the user's natural language prompt.
 * Forces the output into a strict JSON format compatible with React Flow.
 * Returns a GraphTopology object matching the canonical types in types/graph.ts.
 */
export const generateArchitectureFromPrompt = async (prompt: string): Promise<GraphTopology> => {
  const systemPrompt = `
    You are an expert Cloud Solutions Architect designing highly scalable distributed systems.
    The user will provide a scenario or application idea. You must design the infrastructure topology and output it STRICTLY in JSON format.
    
    CRITICAL RULES:
    1. Every node MUST have the property "type": "custom".
    2. The "data.type" property of each node MUST be exactly one of the following strings: ${VALID_NODE_TYPES.join(', ')}.
    3. Generate logical X and Y coordinates (e.g., Load Balancers at y: 100, API Gateways at y: 250, Services at y: 400, Databases at y: 600) so the graph visually flows top-to-bottom. Space them out horizontally (x: 100, 400, 700).
    4. Connect the nodes logically using edges. Data generally flows from top to bottom, so use "sourceHandle": "bottom" and "targetHandle": "top".
    5. Ensure all edge "source" and "target" IDs map to existing node IDs.
    6. Every node's "data" object MUST include "isActive": true.
    
    OUTPUT SCHEMA:
    {
      "nodes": [
        { 
          "id": "1", 
          "type": "custom", 
          "position": { "x": 400, "y": 100 }, 
          "data": { "label": "Main Load Balancer", "type": "Infrastructure", "isActive": true } 
        }
      ],
      "edges": [
        { "id": "e1-2", "source": "1", "target": "2", "sourceHandle": "bottom", "targetHandle": "top" }
      ]
    }
    
    Respond ONLY with the raw JSON object. Do not include markdown formatting like \`\`\`json, and do not provide any conversational text.
  `;

  try {
    const completion = await createCompletionWithFallback({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1, // Very low temperature prevents the LLM from hallucinating invalid node types
      response_format: { type: 'json_object' }, // Native JSON mode support
    });

    const responseContent = completion.choices[0]?.message?.content;

    if (!responseContent) {
      throw new Error('Groq returned an empty response content.');
    }

    // Parse the generated string into the canonical GraphTopology type
    const parsedData = JSON.parse(responseContent) as GraphTopology;

    // Optional: You could add extra validation here to ensure every generated
    // node actually has a valid type before sending it to the client, but the 
    // LLM system prompt is usually strict enough.

    return parsedData;

  } catch (error) {
    logger.error(`[Groq Service Error] Failed to generate architecture: ${error instanceof Error ? error.message : String(error)}`);
    throw new Error('Failed to generate architecture from AI provider.');
  }
};

export const generateArchitectureReview = async (simulationResult: any): Promise<string> => {
  const prompt = `You are a senior SRE reviewing a distributed system simulation.
RESULT: Grade ${simulationResult.grade}, Status ${simulationResult.status}
Requests: ${simulationResult.totalRequests}, Failed: ${simulationResult.totalFailures}
Peak latency: ${simulationResult.peakLatency}ms
Primary cause: ${simulationResult.rootCause?.primaryCause}

Write a post-mortem with 3 sections:
**What went wrong** (2 sentences)
**Root cause** (name the specific failure pattern)
**3 concrete fixes** (bullet points, specific architectural changes)
Max 120 words. Be technical and specific.`;

  const completion = await createCompletionWithFallback({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens: 300,
  });
  return completion.choices[0]?.message?.content || '';
};
