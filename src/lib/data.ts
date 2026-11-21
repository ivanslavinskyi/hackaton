import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

let database: DatabaseSync | undefined;

/** Only the vetted, physically separated serving database may be opened here. */
export function getDataDb(): DatabaseSync {
  if (!database) {
    const directory = process.env.MARKET_RADAR_DATA_DIR || resolve(process.cwd(), 'data');
    database = new DatabaseSync(resolve(directory, 'market-radar.sqlite'), { readOnly: true });
    database.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 3000;');
    const servingMarker = database.prepare("SELECT name FROM sqlite_master WHERE name = 'dimension_labels'").get();
    if (!servingMarker) {
      database.close();
      database = undefined;
      throw new Error('The data file is not the approved public-serving database.');
    }
  }
  return database;
}
