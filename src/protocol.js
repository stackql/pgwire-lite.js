// Protocol constants
const SSL_REQUEST_CODE = 80877103;
const STARTUP_VERSION = 196608; // 3.0

export function encodeSSLRequest() {
  const buffer = Buffer.alloc(8);
  buffer.writeInt32BE(8, 0); // Message length
  buffer.writeInt32BE(SSL_REQUEST_CODE, 4); // SSL Request code
  return buffer;
}

export function encodeStartupMessage(user, database) {
  const userBytes = Buffer.from(`user\0${user}\0`);
  const databaseBytes = Buffer.from(`database\0${database}\0`);
  const totalLength = 8 + userBytes.length + databaseBytes.length + 1;

  const buffer = Buffer.alloc(totalLength);
  buffer.writeInt32BE(totalLength, 0);
  buffer.writeInt32BE(STARTUP_VERSION, 4);
  userBytes.copy(buffer, 8);
  databaseBytes.copy(buffer, 8 + userBytes.length);
  buffer.writeUInt8(0, totalLength - 1); // Null terminator

  return buffer;
}

export function encodePasswordMessage(password) {
  const passwordBytes = Buffer.from(`${password}\0`);
  const length = 4 + passwordBytes.length;

  const buffer = Buffer.alloc(length);
  buffer.writeInt32BE(length, 0);
  passwordBytes.copy(buffer, 4);

  return buffer;
}

export function decodeResponse(data) {
  const type = String.fromCharCode(data[0]);
  const length = data.readInt32BE(1);

  switch (type) {
    case 'R': // Authentication request
      const authType = data.readInt32BE(5);
      switch (authType) {
        case 0: // AuthenticationOk (successful)
          return { type: 'AuthenticationRequest', authType: 'AuthenticationOk' };
        case 3: // AuthenticationCleartextPassword
          return { type: 'AuthenticationRequest', authType: 'cleartext-password' };
        case 5: // AuthenticationMD5Password
          return { type: 'AuthenticationRequest', authType: 'md5-password' };
        default:
          return { type: 'AuthenticationRequest', authType };
      }
    case 'E': // Error response
      return { type: 'ErrorResponse', message: data.toString('utf8', 5, length - 1) };
    case 'Z': // Ready for query
      return { type: 'ReadyForQuery' };
    case 'S': // Parameter status
      const parameterName = data.toString('utf8', 5, data.indexOf(0x00, 5)); // Read up to the null terminator
      const parameterValue = data.toString('utf8', data.indexOf(0x00, 5) + 1, length - 1); // Get the value
      return { type: 'ParameterStatus', parameterName, parameterValue };
    default:
      return { type: 'Unknown', data };
  }
}
