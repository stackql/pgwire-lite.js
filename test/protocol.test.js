// test/protocol.test.js
//
// Unit tests for the pgwire message parser (no server required).
//
// The regression under test: a pgwire message can span multiple TCP 'data'
// events. Before the framing fix, readResponse parsed each chunk
// independently, so any DataRow larger than one socket chunk truncated
// mid-message and processDataRow crashed with ERR_OUT_OF_RANGE (observed in
// the wild with stackql `SHOW EXTENDED METHODS` rows carrying multi-KB
// method descriptions).

import { EventEmitter } from 'events';
import { assert } from 'chai';
import { readResponse } from '../src/protocol.js';

const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

class MockSocket extends EventEmitter {
  end() {}
}

// ----- pgwire message builders (server -> client) -----

// type byte + uint32 length (includes the 4 length bytes, excludes the type
// byte) + content
function msg(type, content) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(content.length + 4, 0);
  return Buffer.concat([Buffer.from(type), len, content]);
}

// RowDescription: uint16 field count, then per field a null-terminated name
// followed by 18 metadata bytes (tableOID 4, attnum 2, typeOID 4, typlen 2,
// atttypmod 4, format 2)
function rowDescription(names) {
  const head = Buffer.alloc(2);
  head.writeUInt16BE(names.length, 0);
  const parts = [head];
  for (const name of names) {
    parts.push(Buffer.from(`${name}\0`), Buffer.alloc(18));
  }
  return msg('T', Buffer.concat(parts));
}

// DataRow: uint16 field count, then per field an int32 length (-1 = NULL)
// followed by that many bytes
function dataRow(values) {
  const head = Buffer.alloc(2);
  head.writeUInt16BE(values.length, 0);
  const parts = [head];
  for (const value of values) {
    if (value === null) {
      const f = Buffer.alloc(4);
      f.writeInt32BE(-1, 0);
      parts.push(f);
    } else {
      const body = Buffer.from(value, 'utf-8');
      const f = Buffer.alloc(4);
      f.writeInt32BE(body.length, 0);
      parts.push(f, body);
    }
  }
  return msg('D', Buffer.concat(parts));
}

const commandComplete = (tag) => msg('C', Buffer.from(`${tag}\0`));
const readyForQuery = () => msg('Z', Buffer.from('I'));

// Emit a byte stream to the socket in slices of `chunkSize`
function emitInChunks(socket, stream, chunkSize) {
  for (let i = 0; i < stream.length; i += chunkSize) {
    socket.emit('data', stream.slice(i, i + chunkSize));
  }
}

describe('protocol readResponse framing', function () {
  it('parses a full response delivered in a single chunk', async () => {
    const socket = new MockSocket();
    const promise = readResponse(socket, silentLogger, 'query');
    const stream = Buffer.concat([
      rowDescription(['id', 'name']),
      dataRow(['1', 'alpha']),
      dataRow(['2', 'beta']),
      commandComplete('SELECT 2'),
      readyForQuery(),
    ]);
    socket.emit('data', stream);
    const result = await promise;
    assert.equal(result.message, 'Ready for query.');
    assert.deepEqual(result.data, [
      { id: '1', name: 'alpha' },
      { id: '2', name: 'beta' },
    ]);
  });

  it('parses a DataRow far larger than a single chunk (the ERR_OUT_OF_RANGE regression)', async () => {
    // 256KB field emitted in 8KB slices: 30+ chunks per message. Before the
    // framing fix this crashed in processDataRow.
    const bigValue = 'x'.repeat(64 * 1024) + '-middle-' + 'y'.repeat(192 * 1024);
    const socket = new MockSocket();
    const promise = readResponse(socket, silentLogger, 'query');
    const stream = Buffer.concat([
      rowDescription(['MethodName', 'description']),
      dataRow(['get_object', bigValue]),
      commandComplete('SELECT 1'),
      readyForQuery(),
    ]);
    emitInChunks(socket, stream, 8 * 1024);
    const result = await promise;
    assert.equal(result.message, 'Ready for query.');
    assert.lengthOf(result.data, 1);
    assert.equal(result.data[0].MethodName, 'get_object');
    assert.equal(result.data[0].description, bigValue);
  });

  it('parses messages split mid-header (chunk boundary inside the 5 header bytes)', async () => {
    const socket = new MockSocket();
    const promise = readResponse(socket, silentLogger, 'query');
    const stream = Buffer.concat([
      rowDescription(['a']),
      dataRow(['value-1']),
      dataRow(['value-2']),
      commandComplete('SELECT 2'),
      readyForQuery(),
    ]);
    // 3-byte slices guarantee splits inside headers, inside field-length
    // words, and inside payloads.
    emitInChunks(socket, stream, 3);
    const result = await promise;
    assert.equal(result.message, 'Ready for query.');
    assert.deepEqual(result.data, [{ a: 'value-1' }, { a: 'value-2' }]);
  });

  it('handles NULL fields and multi-message chunks together', async () => {
    const socket = new MockSocket();
    const promise = readResponse(socket, silentLogger, 'query');
    const stream = Buffer.concat([
      rowDescription(['k', 'v']),
      dataRow(['key-1', null]),
      dataRow([null, 'val-2']),
      commandComplete('SELECT 2'),
      readyForQuery(),
    ]);
    // First chunk carries one and a half messages; the rest follows.
    const cut = rowDescription(['k', 'v']).length + 7;
    socket.emit('data', stream.slice(0, cut));
    socket.emit('data', stream.slice(cut));
    const result = await promise;
    assert.equal(result.message, 'Ready for query.');
    assert.deepEqual(result.data, [
      { k: 'key-1', v: null },
      { k: null, v: 'val-2' },
    ]);
  });

  it('parses an error response spanning chunks', async () => {
    const socket = new MockSocket();
    const promise = readResponse(socket, silentLogger, 'query');
    const stream = Buffer.concat([
      msg('E', Buffer.from('SFATAL\0Msomething went wrong\0\0')),
      readyForQuery(),
    ]);
    emitInChunks(socket, stream, 4);
    const result = await promise;
    // 'Z' arrives last, so the final message is Ready for query; the error
    // text must have been consumed without desyncing the parser.
    assert.equal(result.message, 'Ready for query.');
    assert.deepEqual(result.data, []);
  });
});
