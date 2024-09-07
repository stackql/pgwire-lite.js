import fs from 'fs';
import Connection from '../src/connection.js';  // Adjust this path as per your structure

async function runSecureQueries() {
  const host = '127.0.0.1';
  const port = 5444;
  const user = 'stackql';
  const database = 'stackql';
  const password = 'stackql';
  const cert = fs.readFileSync('/home/javen/ssl-test/client_cert.pem');
  const key = fs.readFileSync('/home/javen/ssl-test/client_key.pem');
  const ca = fs.readFileSync('/home/javen/ssl-test/server_cert.pem');

  const connection = new Connection({
    host,
    port,
    user,
    database,
    password,
    cert,
    key,
    ca,
    useTLS: true,
  });

  try {
    await connection.connect();
    
    const queries = [
      'REGISTRY LIST',
      'REGISTRY PULL google',
      'SHOW PROVIDERS',
      "SHOW EXTENDED SERVICES In google LIKE '%container%'"
    ];

    for (const query of queries) {
      console.info(`Running query: ${query}`);
      const result = await connection.query(query);
      console.info(`Result for query: ${query}:`, result);
    }

    connection.client.destroy();  // Cleanly close the connection
  } catch (err) {
    console.error('Error running secure queries:', err.message);
  }
}

runSecureQueries();
