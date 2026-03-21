// backend/src/controllers/ai.controller.ts
import { Request, Response, NextFunction } from 'express';
import { generateArchitectureFromPrompt } from '../services/groq.service';
import { AI_RATE_LIMITS } from '../config/constants';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Controller for handling AI Architecture Generation requests.
 * Route: POST /api/ai/generate
 */
export const generateArchitecture = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { prompt } = req.body;

        // 1. Input Validation
        if (!prompt) {
            res.status(400).json({
                success: false,
                error: 'Prompt is required.',
            });
            return;
        }

        if (typeof prompt !== 'string') {
            res.status(400).json({
                success: false,
                error: 'Prompt must be a string.',
            });
            return;
        }

        if (prompt.length > AI_RATE_LIMITS.MAX_PROMPT_LENGTH) {
            res.status(413).json({
                success: false,
                error: `Prompt exceeds the maximum allowed length of ${AI_RATE_LIMITS.MAX_PROMPT_LENGTH} characters.`,
            });
            return;
        }

        logger.info(`[AI Generation] Received prompt: "${prompt.substring(0, 50)}..."`);

        // 2. Call the Groq Service (Llama 3)
        // This delegates the actual API call and JSON parsing to the service layer
        const generatedGraph = await generateArchitectureFromPrompt(prompt);

        // 3. Return payload aligned with frontend API contract
        res.status(200).json(generatedGraph);

    } catch (error) {
        logger.error(`[AI Generation Error] ${error instanceof Error ? error.message : String(error)}`);

        // Pass the error to the global errorHandler middleware
        next(error);
    }
};

export const analyseArchitectureImage = async (
    req: Request, res: Response, next: NextFunction
): Promise<void> => {
    try {
        const { imageBase64, mimeType, imageWidth, imageHeight } = req.body;
        if (!imageBase64) {
            res.status(400).json({ error: 'imageBase64 is required.' });
            return;
        }

        const prompt = `You are an expert distributed systems architect. Analyse this architecture diagram image and extract ALL components and their connections.

Return ONLY a valid JSON object with this exact structure - no markdown, no explanation:
{
    "confidence": 85,
    "nodes": [
        { "id": "node-1", "label": "Load Balancer", "type": "Infrastructure", "x": 400, "y": 100 },
        { "id": "node-2", "label": "API Server", "type": "Node Service", "x": 200, "y": 250 }
    ],
    "edges": [
        { "id": "e1", "source": "node-1", "target": "node-2" }
    ]
}

RULES:
- type must be one of: Infrastructure, Gateway, Node Service, Database, Cache, RabbitMQ, Background Job, Edge Network
- Preserve the same relative layout as the image: if a component is top-left in the image, keep it top-left in output
- Generate realistic x,y positions that keep the original arrangement while flowing top-to-bottom where applicable
- Keep spacing similar to the source image and avoid overlap
- The uploaded image dimensions are width=${Number(imageWidth) || 0}, height=${Number(imageHeight) || 0}; return x and y in this same coordinate space
- Do not reorder layers: preserve left-right and top-bottom ordering from the image
- id must be unique strings like "node-1", "node-2" etc
- edge id must be like "e1", "e2" etc
- source and target in edges must match node ids exactly
- confidence is 0-100 integer representing how clearly you can read the diagram
- Extract every visible component - do not skip any box or shape you can see
- If you cannot identify a component type, use "Node Service"`;

        const groq = new (await import('groq-sdk')).default({ apiKey: env.GROQ_API_KEY });

        const completion = await groq.chat.completions.create({
            model: 'meta-llama/llama-4-scout-17b-16e-instruct',
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:${mimeType || 'image/png'};base64,${imageBase64}`,
                            },
                        },
                        {
                            type: 'text',
                            text: prompt,
                        },
                    ],
                },
            ],
            temperature: 0.1,
            max_tokens: 2000,
            response_format: { type: 'json_object' },
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) throw new Error('Empty response from vision model.');

        const parsed = JSON.parse(content);

        const toNum = (v: any, fallback: number) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : fallback;
        };

        const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
        const sourceW = Math.max(1, toNum(imageWidth, 1000));
        const sourceH = Math.max(1, toNum(imageHeight, 700));
        const targetW = 1200;
        const targetH = 700;
        const padX = 80;
        const padY = 60;

        const normalizedCoordinates = rawNodes.map((n: any, idx: number) => {
            const x = Math.max(0, Math.min(sourceW, toNum(n.x, 120 + idx * 140)));
            const y = Math.max(0, Math.min(sourceH, toNum(n.y, 100 + idx * 90)));

            return {
                ...n,
                x: padX + (x / sourceW) * (targetW - padX * 2),
                y: padY + (y / sourceH) * (targetH - padY * 2),
            };
        });

        // Ensure nodes have required React Flow fields
        const nodes = normalizedCoordinates.map((n: any) => ({
            id: n.id || `node-${Date.now()}-${Math.random()}`,
            type: 'custom',
            position: { x: toNum(n.x, 200), y: toNum(n.y, 200) },
            data: {
                label: n.label || 'Unknown',
                type: n.type || 'Node Service',
                isActive: false,
            },
        }));

        const edges = (parsed.edges || []).map((e: any) => ({
            id: e.id || `e-${Date.now()}-${Math.random()}`,
            source: e.source,
            target: e.target,
            type: 'smoothstep',
            animated: false,
            style: { stroke: 'rgba(59,130,246,0.5)', strokeWidth: 2.5 },
        }));

        res.status(200).json({
            confidence: parsed.confidence || 75,
            nodes,
            edges,
            nodeCount: nodes.length,
            edgeCount: edges.length,
            componentSummary: nodes.map((n: any) => ({ label: n.data.label, type: n.data.type })),
        });

    } catch (error) {
        logger.error(`[Vision Analysis Error] ${error instanceof Error ? error.message : String(error)}`);
        next(error);
    }
};
