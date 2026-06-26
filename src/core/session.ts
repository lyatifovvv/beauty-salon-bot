import { Context } from 'grammy';
import { SessionData } from '../types/session';

export type MyContext = Context & { session: SessionData };

export function initial(): SessionData {
  return { step: 'idle' };
}
