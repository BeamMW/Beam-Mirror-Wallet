const net = require('net')
const fs = require('fs')
const tls = require('tls');

console.log("Starting Beam Wallet Bridge...")

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
    console.log('Error, bridge.cfg not loaded')
    return
}

var api = null
var client = null

function syncWithBeam()
{
    console.log("connecting to Beam")

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

syncWithBeam()

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

            var result = []

            if(res && res.length)
            {
                console.log('received from mirror:', res)

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
                                var res = JSON.parse(buf)
                                buf = ''

                                console.log('received from wallet api:', res)

                                result.push({id:item.id, result:res})

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
            else
            {
                client.write(JSON.stringify([]) + '\n')
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
