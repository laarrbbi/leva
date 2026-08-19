import { sql as m001 } from './001_initial';

export interface Migration {
  readonly id: number;
  readonly name: string;
  readonly sql: string;
}

/** Ordered, append-only. Never edit a migration that has shipped — add a new one. */
export const MIGRATIONS: readonly Migration[] = [{ id: 1, name: '001_initial', sql: m001 }];
