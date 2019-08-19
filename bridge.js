const net       = require('net')
const fs        = require('fs')
const tls       = require('tls')
const crypto    = require('crypto')
const http      = require('http')

console.log("Starting Beam Wallet Bridge...\n")

var args = process.argv.slice(2)

if(args.length == 1)
{
    if(args[0] == '--generate-key-pair')
    {     
        console.log('Generating Private and Public keys...\n')
        
        const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', 
        {
            modulusLength: 4096,
            publicKeyEncoding: 
            {
                type: 'pkcs1',
                format: 'pem',
            },

            privateKeyEncoding: 
            {
                type: 'pkcs1',
                format: 'pem',
                cipher: 'aes-256-cbc',
                passphrase: '',
            }
        })

        fs.writeFileSync('beam-private.pem', privateKey, {mode:0o600})
        console.log('Private key saved to "beam-private.pem" file.\n')

        fs.writeFileSync('beam-public.pem', publicKey)
        console.log('Public key saved to "beam-public.pem" file.\n')

        console.log(publicKey)

        console.log('Please copy the public key file near to the client host!\n')

    }
    else console.log('Error, unknown parameter:', args[0])

    return
}

function readConfig(name)
{
    if(fs.existsSync(name))
    {
        var data = fs.readFileSync(name)
        if(data) return JSON.parse(data)
    }

    return null
}

const cfg = readConfig('bridge.cfg')

if(!cfg)
{
    console.log('Error, bridge.cfg not loaded.')
    return
}

cfg.private_key = cfg.private_key || 'beam-private.pem'

var private_key = fs.readFileSync(cfg.private_key)

if(private_key) console.log('Private key "'+cfg.private_key+'" loaded...\n')
else
{
    console.log('Error, private key "'+private_key+'" not loaded.')
    return
}

cfg.verify_signature = cfg.verify_signature || false

var api = null
var client = null

cfg.wallet_api_use_http = cfg.wallet_api_use_http || false

function syncWithBeam()
{
    if(cfg.wallet_api_use_http)
    {
        if(client == null)
            syncWithMirror()
    }
    else
    {
        console.log('connecting to Beam using TCP')

        api = new net.Socket()

        var acc = ''

        api.connect(cfg.wallet_api_port, cfg.wallet_api_addr, () =>
        {
            console.log('connected to api')

            if(client == null)
                syncWithMirror()
        })

        api.on('close', () =>
        {
            console.log('api connection closed, reconecting...')
            setTimeout(syncWithBeam, cfg.push_period)
        })

        api.on('error', (error)=>
        {
            console.log('error occured :(')
            console.log(error)
        })
    }
}

syncWithBeam()

function httpHandler(res)
{
    var result = {items:[]}

    var handle = () =>
    {
        if(res.length)
        {
            var item = res.splice(0, 1)[0]

            console.log('connecting to Beam using HTTP')

            var data = JSON.stringify(item.body)

            var req = http.request(
            {
                host: cfg.wallet_api_addr,
                port: cfg.wallet_api_port,
                path: '/api/wallet',
                method: 'POST',
                headers: {
                    'Content-Type': 'Content-Type: application/json',
                    'Content-Length': Buffer.byteLength(data)
                }
            }, (response) => 
            {
                var buf = ''

                if(response.statusCode == 200)
                {
                    response.setEncoding('utf8')

                    response.on('data', (chunk) => 
                    {
                        buf += chunk
                    })

                    response.on('end', () => 
                    {
                        var encrypted = crypto.privateEncrypt(private_key, Buffer.from(buf))
                        result.items.push({id:item.id, result:encrypted.toString('hex')})
                        buf = ''

                        handle()
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
            })

            console.log('writing to beam api', data)

            req.write(data)
            req.end()
        }
        else
        {
            client.write(JSON.stringify(result) + '\n')
        }
    }

    handle()
}

function tcpHandler(res)
{
    var result = {items:[]}
    
    var handle = () =>
    {
        if(res.length)
        {
            var item = res.splice(0, 1)[0]
            var buf = ''

            api.once('data', (chunk) =>
            {
                buf += chunk

                if(chunk.indexOf('\n') != -1)
                {
                    var encrypted = crypto.privateEncrypt(private_key, Buffer.from(buf))
                    result.items.push({id:item.id, result:encrypted})
                    buf = ''     

                    handle()
                }
            })

            var data = JSON.stringify(item.body)

            console.log('writing to beam api', data)

            api.write(data + '\n')
        }
        else
        {
            client.write(JSON.stringify(result) + '\n')
        }
    }

    handle()
}

const INVALID_METHOD = -32601
const INVALID_REQUEST = -32600

var supportedMethods = 
[
    'validate_address',
    'addr_list',
    'tx_status',
    'get_utxo',
    'tx_list',
    'wallet_status'
]

function sendError(client, code, message, request, item)
{
    var encrypted = crypto.privateEncrypt(private_key, Buffer.from(JSON.stringify({jsonrpc: '2.0',error: {code: code, message: message}})))
    var result = {items:[{id:item.id, result:encrypted}]}
    client.write(JSON.stringify(result) + '\n')
}

function syncWithMirror()
{
    client = cfg.use_tls
        ? tls.connect(cfg.mirror_port, cfg.mirror_addr, {rejectUnauthorized: false})
        : net.connect(cfg.mirror_port, cfg.mirror_addr)

    var acc = ''

    client.on('data', (data) =>
    {
        acc += data

        if(data.indexOf('\n') != -1)
        {
            var res = JSON.parse(acc)
            acc = ''

            if(res && res.length)
            {
                console.log('received from mirror:', res)

                var resItem = res[0]

                console.log('resItem:', resItem)

                try
                {
                    resItem.body = JSON.parse(crypto.privateDecrypt(private_key, Buffer.from(resItem.body, 'hex')))
                }
                catch(error)
                {
                    console.log('Error, something went wrong...')
                    console.log(error)
                    sendError(client, INVALID_REQUEST, 'Invalid Request', resItem.body, resItem)
                    return
                }
                
                if (supportedMethods.indexOf(resItem.body.method) != -1)
                {
                    cfg.wallet_api_use_http
                        ? httpHandler(res)
                        : tcpHandler(res)
                }
                else
                {
                    console.log('invalid method:', resItem.body.method)
                    sendError(client, INVALID_METHOD, 'Method not found', resItem.body, resItem)
                }
            }
            else
            {
                client.write(JSON.stringify({items:[]}) + '\n')
            }
        }
    })

    client.on('error', (error)=>
    {
        console.log('error occured, cannot connect to the Wallet Mirror :(')
        // console.log(error)
    })

    client.on('close', ()=>
    {
        // console.log('connection closed')
        client = null
        setTimeout(syncWithMirror, cfg.push_period)
    })
}
