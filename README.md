# pgwire-lite

pgwire-lite is a minimalistic PostgreSQL wire protocol library for Node.js. It is designed to be a lightweight alternative to other PostgreSQL wire protocol libraries, providing a simple and efficient way to connect to and interact with PostgreSQL databases.

## Testing

Download [`stackql`](https://github.com/stackql/stackql) using the following to test the package locally:

```
curl -L https://bit.ly/stackql-zip -O \
&& unzip stackql-zip
```

then run:

```bash
# test without TLS
npm test
# test with TLS
npm run secure-test
```

psql -d "host=127.0.0.1 port=5444 user=stackql sslmode=verify-full sslcert=/home/javen/ssl-test/client_cert.pem sslkey=/home/javen/ssl-test/client_key.pem sslrootcert=/home/javen/ssl-test/server_cert.pem dbname=stackql" -c "\conninfo"

NODE_DEBUG=tls,node::http npm run secure-test

sh start-secure-server.sh
node example/app.js


NODE_DEBUG=tls,node::http node example/app.js true


node example/app.js