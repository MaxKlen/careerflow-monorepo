import { createDb } from '@careerflow/db';
import { env } from './env.js';

export const { db, pool } = createDb(env.DATABASE_URL);
