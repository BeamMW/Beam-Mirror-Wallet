// Client config

const MirrorAddr = '127.0.0.1'
const MirrorPort = 80
const PublicKey = 'beam-public.pem'
const ClientRequest = {jsonrpc:"2.0",id:1,method:"wallet_status1"}

//////////////////////////////////////////////////////

const http = require('http')
const fs = require('fs')
const crypto = require('crypto')

console.log('Beam Mirror HTTP client example...')

// load public key
var public_key = fs.readFileSync(PublicKey)

if(!public_key)
{
	console.log('Error, public key not loaded.')
	return
}

console.log('Public key loaded...')

// encrypt and send request
var encData = crypto.publicEncrypt(public_key, Buffer.from(JSON.stringify(ClientRequest)))

var req = http.request
(
	{
	    host: MirrorAddr,
	    port: MirrorPort,
	    path: '/api/wallet',
	    method: 'POST',
	    headers: {
	        'Content-Type': 'Content-Type: application/octet-stream',
	        'Content-Length': Buffer.byteLength(encData)
	    }
	},
    (response) => 
    {
    	var buf = []

        if(response.statusCode == 200)
        {
            response.on('data', (chunk) => 
            {
                buf.push(chunk)
            })

            response.on('end', () => 
            {
            	// decrypt result with the public key
            	var result = crypto.publicDecrypt(public_key, Buffer.concat(buf)).toString()
                console.log(result)
                buf = []
            })

            response.on('error', (error)=>
            {
                console.log('error occured :(')
                console.log(error)
            })         
        }
        else
        {
            console.log(`Http error, status: ${response.statusCode}`)
        }
    }
)

req.write(encData)
req.end()
