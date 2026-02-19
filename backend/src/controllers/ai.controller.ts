// backend/src/controllers/ai.controller.ts
import { Request, Response, NextFunction } from 'express';
import { generateArchitectureFromPrompt } from '../services/groq.service';
import { AI_RATE_LIMITS } from '../config/constants';
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

        // 3. Return the payload to the React frontend
        res.status(200).json({
            success: true,
            data: generatedGraph, // Contains the perfectly typed Nodes and Edges
            message: 'Architecture generated successfully.',
        });

    } catch (error) {
        logger.error(`[AI Generation Error] ${error instanceof Error ? error.message : String(error)}`);

        // Pass the error to the global errorHandler middleware
        next(error);
    }
};