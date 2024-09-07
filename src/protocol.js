import { Buffer } from 'buffer';

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

export function decodeResponse(data, logger) {
  const type = String.fromCharCode(data[0]);
  const length = data.readInt32BE(1);
  let offset;

  logger.debug(`decodeResponse type: ${type}`);
  logger.debug(`decodeResponse length: ${length}`);

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

    case 'T': // RowDescription
      const fieldCount = data.readInt16BE(5);
      const fields = [];
      offset = 7;
      for (let i = 0; i < fieldCount; i++) {
        const fieldName = data.toString('utf8', offset, data.indexOf(0x00, offset));
        offset += fieldName.length + 1 + 18; // Field name + null terminator + other metadata
        fields.push(fieldName);
      }
      return { type: 'RowDescription', fields };

    case 'D': // DataRow
      const columnCount = data.readInt16BE(5);
      const row = [];
      offset = 7;
      for (let i = 0; i < columnCount; i++) {
        const columnLength = data.readInt32BE(offset);
        offset += 4;
        if (columnLength === -1) {
          row.push(null); // Column value is NULL
        } else {
          const value = data.toString('utf8', offset, offset + columnLength);
          offset += columnLength;
          row.push(value);
        }
      }
      return { type: 'DataRow', row };
    

    case 'C': // CommandComplete
      const command = data.toString('utf8', 5, length - 1);
      return { type: 'CommandComplete', command };

    default:
      return { type: 'Unknown', data };
  }
}


// function parseRowData(data) {
//   const row = {};
//   let offset = 0;
//   const fieldCount = data.readInt16BE(offset); // Number of fields in the row
//   offset += 2;

//   for (let i = 0; i < fieldCount; i++) {
//     const fieldLength = data.readInt32BE(offset); // Length of the field
//     offset += 4;

//     if (fieldLength === -1) {
//       row[`column_${i}`] = null; // NULL value
//     } else {
//       row[`column_${i}`] = data.toString('utf8', offset, offset + fieldLength); // Field value
//       offset += fieldLength;
//     }
//   }

//   return row;
// }

// export function decodeResponse(data) {
//   const type = String.fromCharCode(data[0]);
//   const length = data.readInt32BE(1);

//   switch (type) {
//     case 'S': // ParameterStatus
//       const parameterName = data.toString('utf8', 5, data.indexOf(0x00, 5));
//       const parameterValue = data.toString('utf8', data.indexOf(0x00, 5) + 1, length - 1);
//       return { type: 'ParameterStatus', parameterName, parameterValue };
      
//     case 'C': // CommandComplete
//       const command = data.toString('utf8', 5, length - 1);
//       return { type: 'CommandComplete', command };

//     case 'D': // DataRow
//       const columnCount = data.readInt16BE(5);
//       const row = [];
//       let offset = 7;
//       for (let i = 0; i < columnCount; i++) {
//         const columnLength = data.readInt32BE(offset);
//         offset += 4;
//         if (columnLength === -1) {
//           row.push(null);
//         } else {
//           const value = data.toString('utf8', offset, offset + columnLength);
//           offset += columnLength;
//           row.push(value);
//         }
//       }
//       return { type: 'DataRow', row };

//     case 'T': // RowDescription
//       const fieldCount = data.readInt16BE(5);
//       const fields = [];
//       let fieldOffset = 7;
//       for (let i = 0; i < fieldCount; i++) {
//         const fieldName = data.toString('utf8', fieldOffset, data.indexOf(0x00, fieldOffset));
//         fields.push(fieldName);
//         fieldOffset = data.indexOf(0x00, fieldOffset) + 19; // Adjust to skip over additional field metadata
//       }
//       return { type: 'RowDescription', fields };

//     default:
//       return { type: 'Unknown', data };
//   }
// }


export function createQueryMessage(query) {
  // Convert the query string to a buffer with UTF-8 encoding
  const queryBuffer = Buffer.from(query, 'utf-8');
  
  // Calculate the total message length: query length + 4 bytes for length field + 1 byte for null terminator
  const length = queryBuffer.length + 4 + 1;

  // Create a buffer to hold the final message: 'Q' + length (4 bytes) + queryBuffer + null terminator
  const messageBuffer = Buffer.alloc(1 + 4 + queryBuffer.length + 1);
  
  // Write the message type ('Q' for query)
  messageBuffer.write('Q', 0);
  
  // Write the length of the message in big-endian format (4 bytes)
  messageBuffer.writeUInt32BE(length, 1);

  // Copy the query buffer into the message buffer
  queryBuffer.copy(messageBuffer, 5);

  // Add the null terminator at the end
  messageBuffer.writeUInt8(0, messageBuffer.length - 1);

  return messageBuffer;
}