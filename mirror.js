const net = require('net')
const http = require('http')
const url = require('url')
const fs = require('fs')

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

var server = http.createServer((req, res) => 
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
})

server.listen(cfg.http_api_port, (err) => 
{
    if(err)
    {
        return console.log('Error: ', err)
    }

    console.log(`Wallet Mirror HTTP Api is listening on ${cfg.http_api_port}`)
})

console.log("Starting Beam bridge listener...")

var bridge = net.createServer((socket) => 
{
    socket.on('error', (e) => {})

    var acc = ''

    // socket.on('close', (e) => console.log('Socket closed'))

    socket.on('data', (data) => 
    {
        acc += data

        if(data.indexOf('\n') != -1)
        {
            var res = JSON.parse(acc)

            if(res && res.length)
                console.log('received from bridge:', res)

            socket.destroy()

            for(var key in res)
            {
                var resItem = res[key]
                var queueItem = workingQueue[resItem.id]

                if(queueItem)
                {
                    queueItem.res.writeHead(200, { 'Content-Type': 'text/plain' })
                    queueItem.res.end(JSON.stringify(resItem.result))
                }
            }

            workingQueue = null
        }
    })

    socket.write(JSON.stringify(queue.map((item, index) => {return {id:index, body:item.body}})) + '\n')
    workingQueue = queue
    queue = []
})

bridge.listen(cfg.mirror_port, (err) => 
{
    if(err)
    {
        return console.log('Error: ', err)
    }

    console.log(`Wallet Mirror server is listening on ${cfg.mirror_port}`)
})
