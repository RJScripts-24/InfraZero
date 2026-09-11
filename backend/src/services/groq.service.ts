// backend/src/services/groq.service.ts
import Groq from 'groq-sdk';
import { env } from '../config/env';
import { VALID_NODE_TYPES } from '../config/constants';
import { GraphTopology } from '../types/graph';
import { logger } from '../utils/logger';

// Initialize the Groq client using the validated environment variable
const groq = new Groq({ apiKey: env.GROQ_API_KEY });

// Text models. All three previous entries (llama-3.1-8b-instant,
// llama-3.3-70b-versatile, mixtral-8x7b-32768) were decommissioned by Groq and
// returned 404/400, which silently killed architecture generation and every
// narrative in the report. Verified against the live catalogue.
const GROQ_MODEL_CANDIDATES = [
  process.env.GROQ_MODEL,
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-120b',
  'groq/compound-mini',
].filter((model): model is string => Boolean(model && model.trim()));

// Vision-capable models. Groq decommissions models without notice (llama-4-scout was
// retired), so this is a candidate list rather than a single hard-coded id.
const GROQ_VISION_MODEL_CANDIDATES = [
  process.env.GROQ_VISION_MODEL,
  'qwen/qwen3.8-27b',
  'qwen/qwen3.6-27b',
].filter((model): model is string => Boolean(model && model.trim()));

export const createCompletionWithFallback = async (request: Omit<any, 'model'>): Promise<any> => {
  const tried: string[] = [];
  let lastError: unknown = null;

  for (const model of GROQ_MODEL_CANDIDATES) {
    try {
      tried.push(model);
      const completion = await groq.chat.completions.create({ ...(request as any), model } as any);

      // A reasoning model given a small max_tokens can spend the entire budget on
      // hidden reasoning and return an empty string with no error (measured on
      // gpt-oss for an 80-word prompt). Treat that as a failure so the next
      // candidate gets a turn instead of the caller receiving a blank narrative.
      const content = (completion as any)?.choices?.[0]?.message?.content;
      if (typeof content === 'string' && content.trim().length === 0) {
        lastError = new Error('returned empty content');
        logger.warn(`[Groq Service] Model '${model}' returned empty content; trying next candidate.`);
        continue;
      }

      return completion;
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
 * Same fallback strategy as createCompletionWithFallback, but over vision-capable models.
 *
 * The candidates are reasoning models: left unchecked they spend most of the completion
 * budget on hidden reasoning tokens (measured ~1900 vs ~390 for the same diagram), which
 * both starves max_tokens and eats the 8k tokens-per-minute quota. reasoning_effort:'none'
 * suppresses that. Models that reject the parameter are retried without it.
 */
export const createVisionCompletionWithFallback = async (request: Omit<any, 'model'>): Promise<any> => {
  const tried: string[] = [];
  let lastError: unknown = null;

  for (const model of GROQ_VISION_MODEL_CANDIDATES) {
    tried.push(model);

    try {
      return await groq.chat.completions.create({
        ...(request as any),
        model,
        reasoning_effort: 'none',
      } as any);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes('reasoning_effort')) {
        try {
          return await groq.chat.completions.create({ ...(request as any), model } as any);
        } catch (retryError) {
          lastError = retryError;
          const retryMessage = retryError instanceof Error ? retryError.message : String(retryError);
          logger.warn(`[Groq Vision] Model '${model}' failed: ${retryMessage}`);
          continue;
        }
      }

      lastError = error;
      logger.warn(`[Groq Vision] Model '${model}' failed: ${message}`);
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`All Groq vision models failed (${tried.join(', ')}): ${reason}`);
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
  // Deliberately no letter grade in this prompt. The letter belongs to the
  // trained model, and handing the simulation's own letter to a narrative
  // writer put a third, conflicting grade in front of the reader in prose.
  const prompt = `You are a senior SRE reviewing a distributed system simulation.
RESULT: Simulated resilience ${simulationResult.gradeScore ?? 0}/100, Status ${simulationResult.status}
Requests: ${simulationResult.totalRequests}, Failed: ${simulationResult.totalFailures}
Peak latency: ${simulationResult.peakLatency}ms
Primary cause: ${simulationResult.rootCause?.primaryCause}

Do not assign a letter grade; another model owns that verdict.
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
