// Client config

const MirrorAddr = '127.0.0.1'
const MirrorPort = 80
const PublicKey = 'beam-public.pem'
const ClientRequest = {jsonrpc:"2.0",id:1,method:"wallet_status"}

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

function crypt(key, buf, func, chunk)
{
    var res = []
    var offset = 0

    while(true)
    {
        var data = buf.slice(offset, offset + chunk)
        if(data.length == 0)
            break

        res.push(func(key, data))
        offset += chunk
    }

    return Buffer.concat(res)
}

const RsaDecryptChunk = 4096/8 // bytes
const RsaEncryptChunk = RsaDecryptChunk - 42 // bytes

// encrypt and send request
var encData = crypt(public_key, Buffer.from(JSON.stringify(ClientRequest)), crypto.publicEncrypt, RsaEncryptChunk)

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
            	var result = crypt(public_key, Buffer.concat(buf), crypto.publicDecrypt, RsaDecryptChunk).toString()
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
