const net       = require('net')
const http      = require('http')
const https     = require('https')
const url       = require('url')
const fs        = require('fs')
const tls       = require('tls')

console.log("Starting Beam Wallet Mirror...")

function readConfig(name)
{
    if(fs.existsSync(name))
    {
        var data = fs.readFileSync(name)
        if(data) return JSON.parse(data)
    }

    return null
}

const cfg = readConfig('mirror.cfg')

if(!cfg)
{
    console.log('Error, mirror.cfg not loaded')
    return
}

var queue = []
var workingQueue = null

function httpHandler(req, res)
{
    var href = url.parse(req.url)
    var pathParts = href.pathname.split('/')

    if(req.method == 'POST'
        && pathParts.length > 2 
        && pathParts[1] == 'api'
        && pathParts[2] == 'wallet')
    {
        var body = ''

        req.on('data', (data) =>
        {
            body += data

            if (body.length > 1e6)
                req.connection.destroy()
        })

        req.on('end', () => queue.push({req:req, res:res, body:body}))
    }
    else
    {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not found!')
    }
}

if(cfg.use_tls)
{
    if(!fs.existsSync(cfg.tls_key))
    {
        console.log('error: ' + cfg.tls_key + ' file not found.')
        return
    }

    if(!fs.existsSync(cfg.tls_cert))
    {
        console.log('error: ' + cfg.tls_cert + ' file not found.')
        return
    }
}

var server = cfg.use_tls
    ? https.createServer(
        {
            key: fs.readFileSync(cfg.tls_key),
            cert: fs.readFileSync(cfg.tls_cert)
        }, httpHandler)
    : http.createServer(httpHandler)

server.listen(cfg.http_api_port, (err) => 
{
    if(err)
    {
        return console.log('Error: ', err)
    }

    console.log(`Wallet Mirror HTTP${cfg.use_tls ? 'S' : ''} Api is listening on ${cfg.http_api_port}`)
})

console.log("Starting Beam bridge listener...")

function bridgeHandler(socket)
{
    socket.on('error', (e) => {})

    var acc = ''

    // socket.on('close', (e) => console.log('Socket closed'))

    socket.on('data', (data) => 
    {
        acc += data

        if(data.indexOf('\n') != -1)
        {
            socket.destroy()

            try
            {
                var res = JSON.parse(acc)
            }
            catch(error)
            {
                console.log('JSON parsing error:', error)
                console.log(acc)
                return
            }

            if(res && res.items && res.items.length)
                console.log('received from bridge:', res.items)

            if(res.key == cfg.bridge_key)
            {
                for(var key in res.items)
                {
                    var resItem = res.items[key]
                    var queueItem = workingQueue[resItem.id]

                    if(queueItem)
                    {
                        queueItem.res.writeHead(200, { 'Content-Type': 'text/plain' })
                        queueItem.res.end(JSON.stringify(resItem.result))
                    }
                }
            }
            else
            {
                console.log("Error, unknown bridge key: ", res.key)
            }

            workingQueue = null
        }
    })

    socket.write(JSON.stringify(queue.map((item, index) => {return {id:index, body:item.body}})) + '\n')
    workingQueue = queue
    queue = []
}

var bridge = cfg.use_tls
    ? tls.createServer(
        {
            key: fs.readFileSync(cfg.tls_key),
            cert: fs.readFileSync(cfg.tls_cert)
        }, bridgeHandler)
    : net.createServer(bridgeHandler)

bridge.listen(cfg.mirror_port, (err) => 
{
    if(err)
    {
        return console.log('Error: ', err)
    }

    console.log(`Wallet Mirror server is listening on ${cfg.mirror_port}`)
})
