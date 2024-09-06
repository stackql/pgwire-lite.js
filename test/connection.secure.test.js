import fs from 'fs';
import { expect } from 'chai';
import Connection from '../src/connection.js';
import { execSync } from 'child_process';

describe('Secure TLS Connection Tests', function() {
  this.timeout(20000); // Set a higher timeout for TLS connections

  const host = '127.0.0.1';
  const port = 5444;
  const user = 'your_user';
  const database = 'your_database';
  const password = 'your_password';
  const cert = fs.readFileSync('/home/javen/ssl-test/client_cert.pem');
  const key = fs.readFileSync('/home/javen/ssl-test/client_key.pem');
  const ca = fs.readFileSync('/home/javen/ssl-test/server_cert.pem');

  let client;

  afterEach(async () => {
    // Destroy the client after each test if it exists
    if (client) {
      client.destroy();
    }
  });

  it('should connect with TLS and no auth', async () => {
    const connection = new Connection({
      host,
      port,
      database,
      useTLS: true,
      cert,
      key,
      ca,
      debug: true
    });

    client = await connection.connect();
    expect(client).to.be.an('object');

    // Destroy connection after test finishes
    await new Promise((resolve) => {
      client.on('close', resolve);
      client.destroy();
    });
  });

  it('should connect with TLS and auth', async () => {
    const connection = new Connection({
      host,
      port,
      user,
      database,
      password,
      useTLS: true,
      cert,
      key,
      ca,
      debug: true
    });

    client = await connection.connect();
    expect(client).to.be.an('object');

    // Destroy connection after test finishes
    await new Promise((resolve) => {
      client.on('close', resolve);
      client.destroy();
    });
  });
});
