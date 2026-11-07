/**
 * Host half: register the client-visible `tokenPricing` session projection.
 * The projection is a pure fold over already-committed events; the browser
 * half renders it under the composer.
 */
import { createProjectionDefinition } from './lib/projection.js';

export const inject = ['sessionProjections'];

export function apply(ctx) {
  ctx.effect(
    () => ctx.sessionProjections.register(createProjectionDefinition()),
    'token-pricing: projection',
  );
}
