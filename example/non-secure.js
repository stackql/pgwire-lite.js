import Connection from '../src/connection.js';  // Adjust this path as per your structure

async function runNonSecureQueries() {
  const host = 'localhost';
  const port = 5444;
  const user = 'stackql';
  const database = 'stackql';
  const password = 'stackql';
  
  const connection = new Connection({
    host,
    port,
    user,
    database,
    password,
    useTLS: false,
    debug: true
  });

  try {
    await connection.connect();

    const queries = [
      'SHOW PROVIDERS',
      "SHOW EXTENDED SERVICES In google LIKE '%container%'"
    ];

    for (const query of queries) {
      console.info(`Running query: ${query}`);
      const result = await connection.query(query); 
      console.info(`Result for query: ${query}:`, result);
    }
    connection.client.destroy();
  } catch (err) {
    console.error('Error running non-secure queries:', err.message);
  }
}

runNonSecureQueries();
