import { assert } from 'chai';
import { runQuery } from '../src/index.js';

describe('Non-TLS Connection Tests', function () {
  this.timeout(10000); // Set a higher timeout to handle query execution

  const connectionOptions = {
    user: 'stackql',
    database: 'stackql',
    host: 'localhost',
    port: 5444,
    debug: true,
    useTLS: false, // Non-TLS connection
  };

  it('should connect and run and run a statement without TLS', async () => {
    const query = "REGISTRY PULL homebrew";
    const result = await runQuery(connectionOptions, query);
    assert.isArray(result.data);
  });

  it('should connect and run queries without TLS', async () => {
    const query = "SHOW SERVICES IN homebrew";
    const result = await runQuery(connectionOptions, query);
    assert.isArray(result.data);
    assert.isAbove(result.data.length, 0);
  });
});
