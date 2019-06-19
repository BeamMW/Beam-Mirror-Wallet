# Beam Mirror Wallet

You can use _Mirror Wallet_ to isolate your wallet from changes from the outside. It consists of two parts, a bridge, and a mirror. Bridge runs on the private host near the Wallet API and pushes wallet data to the Mirror host.

![image](https://user-images.githubusercontent.com/1101448/59771578-ad400a00-92b2-11e9-9b1e-acfeec1af159.png)

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
		"wallet_api_port": 10000            // Wallet API port
	}
	```
	run `bridge.js` script by calling `node bridge.js`
1. Clone this repo to a public host  
	configure `mirror.cfg` 
	``` js
	{
		"http_api_port": 80,    // port for incomming http requests
		"mirror_port": 8080     // server port for bridge connection
	}

	```
	run `mirror.js` script by calling `node mirror.js`
1. Now you can do HTTP requests to the *Wallet Mirror* on the public host  
	example with CURL usage: 
	```
	curl -d '{"jsonrpc":"2.0","id":1,"method":"wallet_status","key":"h12kj3h1k2h3kj12h3kj12"}' -H "Content-Type: application/json" -X POST http://127.0.0.1:80/api/wallet
	```

