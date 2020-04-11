const dgram = require('dgram');

module.exports = class watchsvr{

    constructor(ip,port) {
        this.server = dgram.createSocket('udp4');

        this.button_cb=function (){};
        this.data_cb=function (){};
        this.keep_alive;

        let gyro = {X:0,Y:0,Z:0,accX:0,accY:0,accZ:0,accTotal:0,button:0};

        this.server.on('close', (err)=> {
            console.log('Watch UDP socket closed')
        });

        this.server.on('error', (err)=> {
            console.log('watchserver error: ',err);
            this.server.close();
        });


        this.server.on('message', (msg, rinfo)=> {
            let arr = msg.toString().split(';');
            gyro.X = parseFloat(arr[0]);
            gyro.Y = parseFloat(arr[1]);
            gyro.Z = parseFloat(arr[2]);
            gyro.accX = parseFloat(arr[3]);
            gyro.accY = parseFloat(arr[4]);
            gyro.accZ = parseFloat(arr[5]);
            gyro.accTotal = parseFloat(arr[6]);
            if(arr[7]=='0'){
                if(gyro.button==0){
                    this.button_cb();
                }
                gyro.button=1

            } else {
                gyro.button=0;
            }
            /*
            let total = Math.sqrt(Math.pow(gyro.accX,2) + Math.pow(gyro.accZ,2));
            gyro.accTotal = Math.sqrt(Math.pow(gyro.accY,2)+Math.pow(total,2))-1;
            */
            this.data_cb(gyro);
        });

        this.server.on('listening', ()=> {
            console.log('Watch-server listening ' + this.server.address().port);
            this.keep_alive = setInterval(()=>{
                this.server.send('Hello',port,ip, (err)=>{})
            }, 1000);
        });

        this.server.bind(0);


    }

}



