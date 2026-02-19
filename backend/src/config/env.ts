// backend/src/config/env.ts
import dotenv from 'dotenv';

// Load environment variables from the local .env file
dotenv.config();

/**
 * Strictly type the environment variables so you get autocomplete
 * across your entire backend (e.g., env.GROQ_API_KEY).
 */
interface EnvConfig {
    NODE_ENV: 'development' | 'production' | 'test';
    PORT: number;
    CORS_ORIGIN: string;
    GROQ_API_KEY: string;
    SUPABASE_URL: string;
    SUPABASE_SERVICE_ROLE_KEY: string;
    WEBHOOK_SECRET: string; // Used to verify Supabase/Clerk auth webhooks
}

/**
 * Validates the presence of required environment variables.
 * Throws a fatal error if any are missing.
 */
const validateEnv = (): EnvConfig => {
    // Array of keys that MUST be present for the app to function
    const requiredVars = [
        'GROQ_API_KEY',
        'SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
        'WEBHOOK_SECRET'
    ];

    // Check which required variables are missing from process.env
    const missingVars = requiredVars.filter((varName) => !process.env[varName]);

    if (missingVars.length > 0) {
        console.error('❌ [FATAL ERROR] Environment validation failed.');
        console.error(`Missing required environment variables: ${missingVars.join(', ')}`);
        console.error('Please check your .env file and ensure all required keys are set.');
        process.exit(1); // Force crash the server if keys are missing
    }

    return {
        // Optional variables with safe defaults
        NODE_ENV: (process.env.NODE_ENV as EnvConfig['NODE_ENV']) || 'development',
        PORT: parseInt(process.env.PORT || '3001', 10),
        CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173', // Vite default

        // Required variables (the '!' tells TypeScript we guarantee these exist)
        GROQ_API_KEY: process.env.GROQ_API_KEY!,
        SUPABASE_URL: process.env.SUPABASE_URL!,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        WEBHOOK_SECRET: process.env.WEBHOOK_SECRET!,
    };
};

// Export the validated environment object as a singleton
export const env = validateEnv();