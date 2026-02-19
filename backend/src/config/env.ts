import dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}

export const env = {
    PORT: parseInt(process.env['PORT'] || '3001', 10),
    NODE_ENV: process.env['NODE_ENV'] || 'development',

    // Groq / AI
    GROQ_API_KEY: requireEnv('GROQ_API_KEY'),

    // Supabase
    SUPABASE_URL: requireEnv('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    SUPABASE_WEBHOOK_SECRET: requireEnv('SUPABASE_WEBHOOK_SECRET'),

    // Clerk
    CLERK_SECRET_KEY: requireEnv('CLERK_SECRET_KEY'),
    CLERK_WEBHOOK_SECRET: requireEnv('CLERK_WEBHOOK_SECRET'),

    // TURN Server
    TURN_SECRET: requireEnv('TURN_SECRET'),
};
