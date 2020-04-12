const dgram = require('dgram');
const helper = require('./helper');

module.exports = class watchsvr{

    constructor(ip,port) {
        this.server = dgram.createSocket('udp4');

        this.button_cb=function (val){};
        this.data_cb=function (data){};
        this.keep_alive;

        this.gyro = {X:0,Y:0,Z:0,accX:0,accY:0,accZ:0,accTotal:0,button:0,button_old: 0};

        this.server.on('close', (err)=> {
            console.log('Watch UDP socket closed')
            clearInterval(this.keep_alive);
        });

        this.server.on('error', (err)=> {
            console.log('Watchserver error: ',err);
            this.server.close();
        });


        this.server.on('message', (msg, rinfo)=> {
            let arr = msg.toString().split(';');
            this.gyro.X = parseFloat(arr[0]);
            this.gyro.Y = parseFloat(arr[1]);
            this.gyro.Z = parseFloat(arr[2]);
            this.gyro.accX = parseFloat(arr[3]);
            this.gyro.accY = parseFloat(arr[4]);
            this.gyro.accZ = parseFloat(arr[5]);
            this.gyro.accTotal = parseFloat(arr[6]);
            if(arr[7]==='0'){
                this.gyro.button=1
            } else {
                this.gyro.button=0;
            }
            if(this.gyro.button !== this.gyro.button_old){
                this.button_cb(this.gyro.button);
            }
            this.gyro.button_old=this.gyro.button;
            /*
            let total = Math.sqrt(Math.pow(gyro.accX,2) + Math.pow(gyro.accZ,2));
            gyro.accTotal = Math.sqrt(Math.pow(gyro.accY,2)+Math.pow(total,2))-1;
            */
            this.data_cb(this.gyro);
        });

        this.server.on('listening', ()=> {
            console.log('Watch-server listening ' + this.server.address().port);
            this.keep_alive = setInterval(()=>{
                this.server.send('Hello',port,ip, (err)=>{})
            }, 1000);
        });

        this.server.bind(0);
        this.saber_cnt=0;
        this.netsid;
        this.saber_state=false;
    }
    saber_stop() {
        this.saber_cnt=1;
        this.saber_state=false;
        this.netsid.gen_cb = ()=>{this.saber_off();};
    }

    set_netsid(nwsid){
        this.netsid=nwsid;
    }

    saber_start() {
        this.saber_cnt = 0;
        this.saber_state=true;
        this.netsid.set_pw(0, 50);
        this.netsid.set_pw(1, 50);
        this.netsid.set_pw(2, 50);
        this.netsid.set_wave(0, 0);
        this.netsid.set_wave(1, 0);
        this.netsid.set_wave(2, 1);
        this.netsid.set_gate(0, 1);
        this.netsid.set_gate(1, 1);

        this.netsid.gen_cb = ()=>{this.saber_on();};
        this.netsid.start_gen();
    }



    saber_on(){
        this.saber_cnt = this.saber_cnt + 0.05;

        let volume = ((100 * this.saber_cnt));

        if(this.saber_cnt>1){
            this.netsid.gen_cb = ()=>{this.saber();};
            this.saber_cnt=0;
            volume=0;
            this.toggle=1;
        }

        this.netsid.set_osc(0,60);
        this.netsid.set_vol(0,volume);

        this.netsid.set_osc(1,80+(100*this.saber_cnt));
        this.netsid.set_vol(1,volume);

        this.netsid.set_gate(2,0);

    }

    saber_off(){
        this.saber_cnt = this.saber_cnt - 0.05;

        let volume = ((100 * this.saber_cnt));

        if(this.saber_cnt<0){
            this.netsid.stop_gen();
            this.saber_cnt=1;
            volume=0;
        }

        this.netsid.set_osc(0,60);
        this.netsid.set_vol(0,volume);

        this.netsid.set_osc(1,80+(100*this.saber_cnt));
        this.netsid.set_vol(1,volume);

        this.netsid.set_gate(2,0);
    }

    saber(){

        let volume = ((100 * Math.abs(this.gyro.accTotal))+30);

        this.netsid.set_osc(1,80+(10*Math.abs(this.gyro.accTotal)));
        this.netsid.set_osc(0,60);
        this.netsid.set_osc(2,800);
        this.netsid.set_vol(0,volume);
        this.netsid.set_vol(1,volume);
        this.netsid.set_vol(2,80);

        if(helper.get_random_int(10)>8){
            this.netsid.set_gate(2,1);
        }else{
            this.netsid.set_gate(2,0);
        }

    }

};



