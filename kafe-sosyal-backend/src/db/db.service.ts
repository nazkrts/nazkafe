import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { APP_CONFIG, AppConfig } from '../config/app-config';

/** Sorgu çalıştırabilen her şey (havuz veya bir işlemdeki bağlantı). */
export interface Queryable {
  query<R extends QueryResultRow = any>(text: string, params?: unknown[]): Promise<QueryResult<R>>;
}

@Injectable()
export class DbService implements OnModuleDestroy, Queryable {
  readonly pool: Pool;

  constructor(@Inject(APP_CONFIG) cfg: AppConfig) {
    this.pool = new Pool({ connectionString: cfg.databaseUrl, max: 10 });
  }

  query<R extends QueryResultRow = any>(text: string, params?: unknown[]): Promise<QueryResult<R>> {
    return this.pool.query<R>(text, params as any[]);
  }

  /** BEGIN/COMMIT/ROLLBACK ile sarılmış işlem. */
  async tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  onModuleDestroy(): Promise<void> {
    return this.pool.end();
  }
}
