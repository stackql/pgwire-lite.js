import net from 'net';
import tls from 'tls';
import { encodeSSLRequest, decodeResponse, encodeStartupMessage, encodePasswordMessage, createQueryMessage } from './protocol.js';
import { createLogger, format, transports } from 'winston';


const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.colorize(),
    format.simple()
  ),
  transports: [new transports.Console()],
});

class Connection {
  constructor({ host, port, user, database, password, cert = '', key = '', ca = '', useTLS = false, debug = false }) {
    this.host = host;
    this.port = port;
    this.user = user;
    this.database = database;
    this.password = password;
    this.cert = cert;
    this.key = key;
    this.ca = ca;
    this.useTLS = useTLS;
    this.client = null;
    this.debug = debug;

    if (this.debug) {
      logger.level = 'debug';
    }
  }

  attachCatchAllEventListener(client) {
    const events = [
      'data', 'end', 'close', 'timeout', 'drain', 'error', 'lookup', 'ready', 'secureConnect', 'connect'
    ];
  
    events.forEach(event => {
      client.on(event, (...args) => {
        logger.debug(`Event triggered: ${event} with args: ${JSON.stringify(args)}`);
      });
    });
  
    client.on('newListener', (event, listener) => {
      logger.debug(`Listener added: ${event}`);
    });
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();

      socket.connect(this.port, this.host, () => {
        logger.info(`connecting to ${this.host}:${this.port} ${this.useTLS ? 'using TLS' : ''}`);
        
        if (this.useTLS) {
          logger.debug('requesting SSL upgrade');
          // Send SSL negotiation request
          const sslRequestMessage = encodeSSLRequest();
          socket.write(sslRequestMessage);
        } else {
          logger.debug('proceeding without TLS');
          this.client = socket;
          this.handleStartup(socket, resolve, reject);
        }
      });

      socket.on('data', (data) => {
        if (this.useTLS) {
          // Check if the server accepts SSL (PostgreSQL returns 'S' for success)
          if (data.toString() === 'S') {
            logger.debug('SSL/TLS upgrade accepted by server, establishing TLS connection');
            // Upgrade the connection to TLS
            const tlsOptions = {
              socket,
              cert: this.cert,
              key: this.key,
              ca: this.ca,
              rejectUnauthorized: true,
              checkServerIdentity: () => undefined // Allow self-signed certificates
            };
            const tlsSocket = tls.connect(tlsOptions, () => {
              logger.info('TLS connection established');
              this.client = tlsSocket;
              this.handleStartup(tlsSocket, resolve, reject);
            });

            tlsSocket.on('data', (data) => {
              const response = decodeResponse(data, logger);
              this.handleResponse(response, tlsSocket, resolve, reject);
            });

            tlsSocket.on('error', (err) => {
              logger.error(`TLS connection error: ${err.message}`);
              reject(err);
            });

            tlsSocket.on('close', () => {
              logger.info('TLS connection closed');
            });

          } else {
            logger.error('server refused SSL connection');
            reject(new Error('server refused SSL connection'));
          }
        } else {
          const response = decodeResponse(data, logger);
          this.handleResponse(response, socket, resolve, reject);
        }
      });

      socket.on('error', (err) => {
        logger.error(`socket connection error: ${err.message}`);
        reject(err);
      });
    });
  }

  handleStartup(client, resolve, reject) {
    logger.debug(`sending startup message with user (${this.user}) and database (${this.database})`);
    const startupMessage = encodeStartupMessage(this.user, this.database);
    client.write(startupMessage);
  }

  handleResponse(response, client, resolve, reject) {
    if (response.type === 'AuthenticationRequest') {
      if (response.authType === 'cleartext-password') {
        logger.debug('server requests cleartext password, sending password');
        const passwordMessage = encodePasswordMessage(this.password);
        client.write(passwordMessage);
      } else if (response.authType === 'md5-password') {
        // Implement MD5 password handling if needed
        logger.debug('server requests MD5 password, sending password (not implemented)');
        reject(new Error('MD5 password authentication not implemented'));
      } else if (response.authType === 'AuthenticationOk') {
        logger.info('authentication successful');
        resolve(client);
      } else {
        logger.error(`unhandled authentication type: ${response.authType}`);
        reject(new Error(`unhandled authentication type: ${response.authType}`));
      }
    } else if (response.type === 'ErrorResponse') {
      logger.error(`error response from server: ${response.message}`);
      reject(new Error(response.message));
    } else if (response.type === 'ReadyForQuery') {
      logger.debug('server is ready for a query');
      resolve(client);
    } else if (response.type === 'ParameterStatus') {
      logger.debug(`received parameter status: ${response.parameterName} = ${response.parameterValue}`);
    } else {
      logger.debug(`received unknown message from server: ${JSON.stringify(response)}`);
    }
  }

  //
  // query operations
  //

  // async query(sqlQuery) {
  //   return new Promise((resolve, reject) => {
  //     logger.debug(`sending query: ${sqlQuery}`);
      
  //     if (!this.client) {
  //       reject(new Error('no connection established'));
  //       return;
  //     }
  
  //     const queryMessage = createQueryMessage(sqlQuery);
  //     this.client.write(queryMessage);
  
  //     const results = [];
  //     let columns = [];
  //     let queryCompleted = false;
  
  //     this.attachCatchAllEventListener(this.client);

  //     this.client.on('data', (data) => {
  //       const response = decodeResponse(data, logger);

  //       logger.debug(`received message from server: ${JSON.stringify(response)}`);
  
  //       if (response.type === 'RowDescription') {
  //         columns = response.fields;
  //         logger.debug(`row description received: ${columns.join(', ')}`);
  //       } else if (response.type === 'DataRow') {
  //         const rowObject = {};
  //         response.row.forEach((value, index) => {
  //           rowObject[columns[index]] = value;
  //         });
  //         results.push(rowObject);
  //         logger.debug('row data received:', rowObject);
  //       } else if (response.type === 'CommandComplete') {
  //         logger.debug('query execution complete.');
  //         resolve({ message: response.command, data: results });
  //       } else if (response.type === 'ReadyForQuery') {
  //         logger.debug('server is ready for a query');
  //         resolve({ message: 'Query complete', data: results });
  //       } else if (response.type === 'ParameterStatus') {
  //         logger.debug(`received parameter status: ${response.parameterName} = ${response.parameterValue}`);
  //       } else if (response.type === 'ErrorResponse') {
  //         logger.error(`error response from server: ${response.message}`);
  //         reject(new Error(response.message));
  //       } else {
  //         logger.debug(`received unknown message from server: ${JSON.stringify(response)}`);
  //       }
  //     });
  
  //     this.client.on('error', (err) => {
  //       logger.error(`error during query: ${err.message}`);
  //       reject(err);
  //     });
  //   });
  // }
  async query(sqlQuery) {
    return new Promise((resolve, reject) => {
      logger.debug(`sending query: ${sqlQuery}`);
  
      if (!this.client) {
        reject(new Error('no connection established'));
        return;
      }
  
      const queryMessage = createQueryMessage(sqlQuery);
      this.client.write(queryMessage);
  
      const results = [];
      let columns = [];
      let queryCompleted = false;
  
      // Event handlers
      const handleData = (data) => {
        const response = decodeResponse(data, logger);
  
        logger.debug(`received message from server: ${JSON.stringify(response)}`);
  
        if (response.type === 'RowDescription') {
          columns = response.fields;
          logger.debug(`row description received: ${columns.join(', ')}`);
        } else if (response.type === 'DataRow') {
          const rowObject = {};
          response.row.forEach((value, index) => {
            rowObject[columns[index]] = value;
          });
          results.push(rowObject);
          logger.debug('row data received:', rowObject);
        } else if (response.type === 'CommandComplete' || response.type === 'ReadyForQuery') {
          logger.debug('query execution complete.');
          queryCompleted = true;
          cleanupListeners();
          resolve({ message: response.command || 'Query complete', data: results });
        } else if (response.type === 'ErrorResponse') {
          logger.error(`error response from server: ${response.message}`);
          cleanupListeners();
          reject(new Error(response.message));
        }
      };
  
      const handleError = (err) => {
        logger.error(`error during query: ${err.message}`);
        cleanupListeners();
        reject(err);
      };
  
      const cleanupListeners = () => {
        this.client.off('data', handleData);
        this.client.off('error', handleError);
      };
  
      // Attach the listeners
      this.client.on('data', handleData);
      this.client.on('error', handleError);
    });
  }
  
}

export default Connection;
