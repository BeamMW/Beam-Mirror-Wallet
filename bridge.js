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
        
        const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', 
        {
            namedCurve: 'secp256k1',
            publicKeyEncoding:  { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        })

        fs.writeFileSync('beam-private.pem', privateKey, {mode:0o600})
        console.log('Private key saved to "beam-private.pem" file.\n')

        fs.writeFileSync('beam-public.pem', publicKey)
        console.log('Public key saved to "beam-public.pem" file.\n')

        console.log(publicKey)

        console.log('Please copy the public key file near to the Beam Mirror Wallet host!\n')

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

function sign(buf, result, item)
{
    const sign = crypto.createSign('sha256')
    sign.write(buf)
    sign.end()

    result.items.push({id:item.id, result:buf, sign:sign.sign(private_key, 'hex')})

    buf = ''
}

function signResponse(buf, result, item)
{
    console.log('received from wallet api:', buf)

    // sign response from the api
    sign(buf, result, item)
}

function httpHandler(res)
{
    var result = {items:[]}

    var handle = () =>
    {
        if(res.length)
        {
            var item = res.splice(0, 1)[0]

            console.log('connecting to Beam using HTTP')

            var req = http.request(
            {
                host: cfg.wallet_api_addr,
                port: cfg.wallet_api_port,
                path: '/api/wallet',
                method: 'POST',
                headers: {
                    'Content-Type': 'Content-Type: application/json',
                    'Content-Length': Buffer.byteLength(item.body)
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
                        signResponse(buf, result, item)

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

            console.log('writing to beam api', item.body)

            req.write(item.body)
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

            api.once('data', (data) =>
            {
                buf += data

                if(data.indexOf('\n') != -1)
                {                
                    signResponse(buf, result, item)        

                    handle()
                }
            })

            console.log('writing to beam api', item.body)

            api.write(item.body + '\n')
        }
        else
        {
            client.write(JSON.stringify(result) + '\n')
        }
    }

    handle()
}

var supportedMethods = 
[
    'validate_address',
    'addr_list',
    'tx_status',
    'get_utxo',
    'tx_list',
    'wallet_status'
]

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

                var item = res[0]
                var body = JSON.parse(item.body)
                if (supportedMethods.indexOf(body.method) != -1)
                {
                    cfg.wallet_api_use_http
                        ? httpHandler(res)
                        : tcpHandler(res)
                }
                else
                {
                    console.log('invalid method:', body.method)
                    var result = {items:[]}
                    sign(JSON.stringify({'id': body.id,'jsonrpc': '2.0','error': {'code': -32601, 'message': 'Method not found'}}) + '\n', result, item)
                    client.write(JSON.stringify(result) + '\n')
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
