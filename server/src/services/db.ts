// Prisma client generated into db/prisma/generated/client, exposed through
// the @amperia/db workspace package so the production esbuild bundle keeps
// it external (bundling the CJS Prisma runtime into the ESM bundle breaks
// its dynamic require / engine paths at boot).
import { PrismaClient } from '@amperia/db';

/** Single Prisma client for the server process. */
export const prisma = new PrismaClient();
