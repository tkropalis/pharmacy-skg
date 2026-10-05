import type { APIRoute } from 'astro';
import { manifestResponse } from '../lib/manifest.ts';

export const GET: APIRoute = () => manifestResponse('el');
