// backend/src/routes/webhooks.routes.ts
import { Router } from 'express';
import express from 'express';
import { handleAuthWebhook } from '../controllers/webhooks.controller';
import { verifyWebhookSignature } from '../middlewares/signatureVerifier';

const router = Router();

/**
 * Authentication Webhooks Route
 * POST /api/webhooks/auth
 * * * Middlewares Applied:
 * 1. express.raw(): This is CRITICAL. It stops Express from converting the incoming 
 * webhook into a JavaScript object. We need the raw buffer to perfectly match 
 * the cryptographic signature sent by Supabase/Clerk.
 * 2. verifyWebhookSignature: Checks that raw buffer against your WEBHOOK_SECRET.
 * 3. handleAuthWebhook: The controller that updates your database.
 */
router.post(
  '/auth',
  express.raw({ type: 'application/json' }), 
  verifyWebhookSignature,
  handleAuthWebhook
);

export default router;