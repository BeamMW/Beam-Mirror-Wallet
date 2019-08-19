# Beam Mirror Wallet

You can use _Mirror Wallet_ to isolate your wallet from changes from the outside. It consists of two parts, a bridge, and a mirror. Bridge runs on the private host near the Wallet API and pushes wallet data to the Mirror host.

![scheme](https://user-images.githubusercontent.com/1101448/63290230-af7e0f00-c2c9-11e9-9634-ccf8dfe0ba2d.png)

## Steps to initialize Mirror Wallet
1. Install latest Nodejs to private and public hosts (`sudo apt-get install nodejs` or download from https://nodejs.org)
1. Run *Beam Wallet API* with enabled *ACL* on a private host  (example: `wallet-api-masternet --node_addr eu-node01.masternet.beam.mw:8100 --use_acl 1`, read more here https://github.com/BeamMW/beam/wiki/Beam-wallet-protocol-API#user-authorization)
1. Clone this repo to a private host,  
	configure `bridge.cfg` 
	``` js
	{
		"push_period": 1000,                // data pushing period
		"mirror_addr": "127.0.0.1",         // public host address
		"mirror_port": 8080                 // public host port
		"wallet_api_addr": "127.0.0.1",     // Wallet API address
		"wallet_api_port": 10000,           // Wallet API port
		"wallet_api_use_http": true,        // use HTTP connection with Wallet API
		"use_tls" : false,                  // use TLS protocol to connect to the Mirror
		"private_key" : "beam-private.pem"  // private key to sign all the messages with the Mirror
	}
	```
	run `node ./bridge.js --generate-key-pair` to generate private and public keys,  
	copy generated `beam-public.pem` to the HTTP Client host,  
	run `bridge.js` script by calling `node bridge.js`.
1. Clone this repo to a public host,  
	configure `mirror.cfg`, 
	``` js
	{
		"http_api_port": 80,        // port for incomming http(s) requests
		"mirror_port": 8080,        // server port for bridge connection
		"use_tls" : false,          // use TLS protocol to talk with the Bridge and HTTP clients
		"tls_cert" : "test.crt",    // path to TLS private key
		"tls_key" : "test.key",     // path to TLS certificate
		"public_key" : "beam-public.pem"	// public key, to make sure you have a conversation with your own Bridge
	}
	```
	run `mirror.js` script by calling `node mirror.js`.
1. Look at the [client-sample.js](https://github.com/BeamMW/Beam-Mirror-Wallet/blob/master/client-sample.js) to understand how to encrypt/decrypt data from from bridge.
