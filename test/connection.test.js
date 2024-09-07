import { expect } from 'chai';
import Connection from '../src/connection.js';

describe('Non-Secure Connection Tests', () => {
  const host = 'localhost';
  const port = 5444;
  const user = 'stackql';
  const database = 'stackql';
  const password = 'stackql';

  it('should connect with auth and no TLS', async () => {
    const connection = new Connection({
      host,
      port,
      user,
      database,
      password,
      debug: true,
      useTLS: false
    });

    const client = await connection.connect();
    expect(client).to.be.an('object');
    client.destroy();
  });

  it('should connect with no auth and no TLS', async () => {
    const connection = new Connection({
      host,
      port,
      database,
      useTLS: false,
      debug: true
    });

    const client = await connection.connect();
    expect(client).to.be.an('object');
    client.destroy();
  });

  // it('should run a query without TLS', async () => {
  //   const connection = new Connection({
  //     host,
  //     port,
  //     user,
  //     database,
  //     password,
  //     useTLS: false
  //   });

  //   const client = await connection.connect();
  //   const result = await connection.query('REGISTRY LIST');
  //   expect(result).to.be.an('object');
  //   expect(result.data).to.be.an('array');
  //   client.destroy();
  // });

});
