const Connection = require('./connection');

class Client {
  constructor(config) {
    this.config = config;
    this.connection = new Connection(config);
  }

  async connect() {
    return this.connection.connect();
  }

  async query(queryText) {
    return this.connection.query(queryText);
  }

  async disconnect() {
    return this.connection.disconnect();
  }
}

module.exports = Client;
