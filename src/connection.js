// import net from 'net';
// import tls from 'tls';
// import { encodeSSLRequest, decodeResponse, encodeStartupMessage, encodePasswordMessage } from './protocol.js';
// import { createLogger, format, transports } from 'winston';

// const logger = createLogger({
//   level: 'info',
//   format: format.combine(
//     format.colorize(),
//     format.simple()
//   ),
//   transports: [new transports.Console()],
// });

// class Connection {
//   constructor({ host, port, user, database, password, cert = '', key = '', ca = '', useTLS = false }) {
//     this.host = host;
//     this.port = port;
//     this.user = user;
//     this.database = database;
//     this.password = password;
//     this.cert = cert;
//     this.key = key;
//     this.ca = ca;
//     this.useTLS = useTLS;
//   }

//   async connect() {
//     return new Promise((resolve, reject) => {
//       const socket = new net.Socket();

//       socket.connect(this.port, this.host, () => {
//         logger.info(`Connected to ${this.host}:${this.port}, requesting SSL upgrade`);
//         // Send SSL negotiation request
//         const sslRequestMessage = encodeSSLRequest();
//         socket.write(sslRequestMessage);
//       });

//       socket.on('data', (data) => {
//         // Check if the server accepts SSL (PostgreSQL returns 'S' for success)
//         if (data.toString() === 'S') {
//           logger.info('SSL/TLS upgrade accepted by server, establishing TLS connection');
//           // Upgrade the connection to TLS
//           const tlsOptions = {
//             socket,
//             cert: this.cert,
//             key: this.key,
//             ca: this.ca,
//             rejectUnauthorized: true,
//             checkServerIdentity: () => undefined
//           };
//           const tlsSocket = tls.connect(tlsOptions, () => {
//             logger.info('TLS connection established');
//             this.handleStartup(tlsSocket, resolve, reject);
//           });
          
//           tlsSocket.on('data', (data) => {
//             const response = decodeResponse(data);
//             this.handleResponse(response, tlsSocket, resolve, reject);
//           });

//           tlsSocket.on('error', (err) => {
//             logger.error(`TLS connection error: ${err.message}`);
//             reject(err);
//           });

//           tlsSocket.on('close', () => {
//             logger.info('TLS connection closed');
//           });

//         } else {
//           logger.error('Server refused SSL connection');
//           reject(new Error('Server refused SSL connection'));
//         }
//       });

//       socket.on('error', (err) => {
//         logger.error(`Socket connection error: ${err.message}`);
//         reject(err);
//       });
//     });
//   }

//   handleStartup(client, resolve, reject) {
//     logger.info('Sending startup message with user and database');
//     const startupMessage = encodeStartupMessage(this.user, this.database);
//     client.write(startupMessage);
//   }

//   handleResponse(response, client, resolve, reject) {
//     if (response.type === 'AuthenticationRequest') {
//       if (response.authType === 'cleartext-password') {
//         logger.info('Server requests cleartext password, sending password');
//         const passwordMessage = encodePasswordMessage(this.password);
//         client.write(passwordMessage);
//       } else if (response.authType === 'md5-password') {
//         // Implement MD5 password handling if needed
//         logger.info('Server requests MD5 password, sending password (not implemented)');
//         reject(new Error('MD5 password authentication not implemented'));
//       } else if (response.authType === 'AuthenticationOk') {
//         logger.info('Authentication successful');
//         resolve(client);
//       } else {
//         logger.error(`Unhandled authentication type: ${response.authType}`);
//         reject(new Error(`Unhandled authentication type: ${response.authType}`));
//       }
//     } else if (response.type === 'ErrorResponse') {
//       logger.error(`Error response from server: ${response.message}`);
//       reject(new Error(response.message));
//     } else if (response.type === 'ReadyForQuery') {
//       logger.info('Server is ready for query');
//       resolve(client);
//     } else if (response.type === 'ParameterStatus') {
//       logger.info(`Received parameter status: ${response.parameterName} = ${response.parameterValue}`);
//     } else {
//       logger.info(`Received unknown message from server: ${JSON.stringify(response)}`);
//     }
//   }

// }

// export default Connection;

import net from 'net';
import tls from 'tls';
import { encodeSSLRequest, decodeResponse, encodeStartupMessage, encodePasswordMessage } from './protocol.js';
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
  constructor({ host, port, user, database, password, cert = '', key = '', ca = '', useTLS = false }) {
    this.host = host;
    this.port = port;
    this.user = user;
    this.database = database;
    this.password = password;
    this.cert = cert;
    this.key = key;
    this.ca = ca;
    this.useTLS = useTLS;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();

      socket.connect(this.port, this.host, () => {
        logger.info(`Connected to ${this.host}:${this.port}`);
        
        if (this.useTLS) {
          logger.info('Requesting SSL upgrade');
          // Send SSL negotiation request
          const sslRequestMessage = encodeSSLRequest();
          socket.write(sslRequestMessage);
        } else {
          logger.info('Proceeding without TLS');
          this.handleStartup(socket, resolve, reject);
        }
      });

      socket.on('data', (data) => {
        if (this.useTLS) {
          // Check if the server accepts SSL (PostgreSQL returns 'S' for success)
          if (data.toString() === 'S') {
            logger.info('SSL/TLS upgrade accepted by server, establishing TLS connection');
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
              this.handleStartup(tlsSocket, resolve, reject);
            });

            tlsSocket.on('data', (data) => {
              const response = decodeResponse(data);
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
            logger.error('Server refused SSL connection');
            reject(new Error('Server refused SSL connection'));
          }
        } else {
          const response = decodeResponse(data);
          this.handleResponse(response, socket, resolve, reject);
        }
      });

      socket.on('error', (err) => {
        logger.error(`Socket connection error: ${err.message}`);
        reject(err);
      });
    });
  }

  handleStartup(client, resolve, reject) {
    logger.info('Sending startup message with user and database');
    const startupMessage = encodeStartupMessage(this.user, this.database);
    client.write(startupMessage);
  }

  handleResponse(response, client, resolve, reject) {
    if (response.type === 'AuthenticationRequest') {
      if (response.authType === 'cleartext-password') {
        logger.info('Server requests cleartext password, sending password');
        const passwordMessage = encodePasswordMessage(this.password);
        client.write(passwordMessage);
      } else if (response.authType === 'md5-password') {
        // Implement MD5 password handling if needed
        logger.info('Server requests MD5 password, sending password (not implemented)');
        reject(new Error('MD5 password authentication not implemented'));
      } else if (response.authType === 'AuthenticationOk') {
        logger.info('Authentication successful');
        resolve(client);
      } else {
        logger.error(`Unhandled authentication type: ${response.authType}`);
        reject(new Error(`Unhandled authentication type: ${response.authType}`));
      }
    } else if (response.type === 'ErrorResponse') {
      logger.error(`Error response from server: ${response.message}`);
      reject(new Error(response.message));
    } else if (response.type === 'ReadyForQuery') {
      logger.info('Server is ready for query');
      resolve(client);
    } else if (response.type === 'ParameterStatus') {
      logger.info(`Received parameter status: ${response.parameterName} = ${response.parameterValue}`);
    } else {
      logger.info(`Received unknown message from server: ${JSON.stringify(response)}`);
    }
  }
}

export default Connection;
