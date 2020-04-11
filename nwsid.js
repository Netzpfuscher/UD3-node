var net = require('net');
var struct = require('./jspack.js');
var helper = require('./helper');

module.exports = class nwsid{
	
	constructor(port, name) {
		
		this.OK = 0;
		this.BUSY = 1;
		this.ERR = 2;
		this.READ = 3;
		this.VERSION = 4;
		this.COUNT = 5;
		this.INFO = 6;

		this.CMD_FLUSH = 0;
		
		this.sid_server = net.createServer(function(socket) {
	
		});
		
		console.log("Bind SID server to " + port);
		this.sid_server.listen(port,'0.0.0.0');
		this.sid_clients = [];
		this.connect();
		
		this.last_frame = Date.now();
		this.registers=new Buffer.from(Array(34));
		this.registers[0]=0xFF;
		this.registers[1]=0xFF;
		this.registers[2]=0xFF;
		this.registers[3]=0xFF;
        this.registers[33]=0x00;

		this.fifo = [];
		this.fifoLength = 200;
		this.delay=0;
		this.name = name;
		this.busy_flag = false;
		this.data_cb=null;
		this.flush_cb=null;
		this.ud_time= new Uint32Array(1);
		this.ud_time[0]=0;

		this.gen_tmr;
		this.gen_cb = ()=>{};

        this.sid_reg = {
            FREQLO1:4,
            FREQHI1 : 5,
            PWLO1 : 6,
            PWHI1 : 7,
            CR1 : 8,
            AD1 : 9,
            SR1 : 10,
            FREQLO2 : 11,
            FREQHI2 : 12,
            PWLO2 : 13,
            PWHI2 : 14,
            CR2 : 15,
            AD2 : 16,
            SR2 : 17,
            FREQLO3 : 18,
            FREQHI3 : 19,
            PWLO3 : 20,
            PWHI3 : 21,
            CR3 : 22,
            AD3 : 23,
            SR3 : 24,
            FCLO : 25,
            FCHI : 26,
            Res_Filt : 27,
            Mode_Vol : 28,
            UD_TIME0 : 29,
            UD_TIME1 : 30,
            UD_TIME2 : 31,
            UD_TIME3 : 32,
            END:33
        }
	}
	
	busy(flag){
		this.busy_flag=flag;
	}

    freqToSID(freq){
        let x = freq * (18*16777216)/17734475;
        return x;
    }

    connect(){
		this.sid_server.on('connection', (sock) => {
			console.log('CONNECTED SID: ' + sock.remoteAddress + ':' + sock.remotePort);
			this.sid_clients.push(sock);
			sock.on('data', (data) => {
				//console.log('DATA ' + sock.remoteAddress + ': ');
				//console.log(data);
				if(data.length<4) return;
				this.sid_prot(sock,data);
			});
			sock.on('close',  () => {
				console.log('CLOSED: ' + sock.remoteAddress  + ':' + sock.remotePort);
				this.sid_clients.splice(this.sid_clients.indexOf(sock), 1);
			});
		});
	}

	start_gen(){
        this.gen_tmr = setInterval(()=>{
            this.ud_time[0] = helper.get_ticks();
            this.registers[this.sid_reg.UD_TIME0] = (this.ud_time[0]>>24) & 0xFF;
            this.registers[this.sid_reg.UD_TIME1] = (this.ud_time[0]>>16) & 0xFF;
            this.registers[this.sid_reg.UD_TIME2] = (this.ud_time[0]>>8) & 0xFF;
            this.registers[this.sid_reg.UD_TIME3] = (this.ud_time[0] & 0xFF);
            this.data_cb(this.registers);
            this.gen_cb();
		},30);
	}

	stop_gen(){
		this.set_gate(0,0);
        this.set_gate(1,0);
        this.set_gate(2,0);
		clearInterval(this.gen_tmr);
	}

	set_osc(n,freq){
		let high;
		let low;
		switch(n){
			case 0:
				high = this.sid_reg.FREQHI1;
				low = this.sid_reg.FREQLO1;
				break;
			case 1:
                high = this.sid_reg.FREQHI2;
                low = this.sid_reg.FREQLO2;
				break;
			case 2:
                high = this.sid_reg.FREQHI3;
                low = this.sid_reg.FREQLO3;
				break;
			default:
                console.log("No Channel: " + n);
				return;
		}
		let temp = this.freqToSID(freq);
        this.registers[low] = temp & 0xFF;
        this.registers[high] = (temp>>8) & 0xFF;
	}

    set_pw(n,pw){
        let high;
        let low;
        switch(n){
            case 0:
                high = this.sid_reg.PWHI1;
                low = this.sid_reg.PWLO1;
                break;
            case 1:
                high = this.sid_reg.PWHI2;
                low = this.sid_reg.PWLO2;
                break;
            case 2:
                high = this.sid_reg.PWHI3;
                low = this.sid_reg.PWLO3;
                break;
            default:
                return;
        }
        if(pw<0) pw =0;
        if(pw>100) pw = 100;
        let temp = 4095 / 100 * pw;
        this.registers[low] = temp & 0xFF;
        this.registers[high] = (temp>>8) & 0xFF;
    }

    set_vol(n,vol){
        let low;
        switch(n){
			case 0:
                low = this.sid_reg.SR1;
                break;
            case 1:
                low = this.sid_reg.SR2;
                break;
            case 2:
                low = this.sid_reg.SR3;
                break;
            default:
                console.log("No Channel: " + n);
                return;
        }
        if(vol<0) vol =0;
        if(vol>100) vol = 100;
        let temp = Math.floor(15 / 100 * vol);
        temp = (temp << 4) | (this.registers[low] & 0x0F);
        this.registers[low] = temp;
    }

    set_wave(n,flag){
        let low;
        switch(n){
            case 0:
                low = this.sid_reg.CR1;
                break;
            case 1:
                low = this.sid_reg.CR2;
                break;
            case 2:
                low = this.sid_reg.CR3;
                break;
            default:
                console.log("No Channel: " + n);
                return;
        }
        if(flag>0){
			this.registers[low] = this.registers[low] & 0b10111111;
            this.registers[low] = this.registers[low] | 0b10000000;
		}else{
            this.registers[low] = this.registers[low] & 0b01111111;
            this.registers[low] = this.registers[low] | 0b01000000;
		}
    }

    set_gate(n,flag){
        let low;
        switch(n){
            case 0:
                low = this.sid_reg.CR1;
                break;
            case 1:
                low = this.sid_reg.CR2;
                break;
            case 2:
                low = this.sid_reg.CR3;
                break;
			default:
            	console.log("No Channel: " + n);
                return;
        }
        if(flag>0){
            this.registers[low] = this.registers[low] | 0b00000001;
        }else{
            this.registers[low] = this.registers[low] & 0b11111110;
        }
    }


	send_ok(socket){
		let resp;
		resp = new Buffer.from(struct.Pack( '!B', [this.OK]));
		socket.write(resp);
	}
	send_busy(socket){
		let resp;
		resp = new Buffer.from(struct.Pack( '!B', [this.BUSY]));
		socket.write(resp);
	}
	send_count(socket,count){
		let resp;
		resp = new Buffer.from(struct.Pack( '!BB', [this.COUNT,count]));
		socket.write(resp);
	}
	send_info(socket,type,name){
		let temp = [];
		let resp;
		temp = struct.Pack( '!BB', [this.INFO, type]);
		resp = name.split("");
		for(let i=0;i<resp.length;i++){
			resp[i] = resp[i].charCodeAt(0);
		}
		resp.push(0x00);
		resp = new Buffer.from(temp.concat(resp));
		socket.write(resp);
	}
	send_version(socket,version){
		let resp;
		resp = new Buffer.from(struct.Pack( '!BB', [this.VERSION,version]));
		socket.write(resp);
	}
	

	sid_prot(socket, data){
		let resp;
		
		switch(data[0]){
			case this.CMD_FLUSH:

			    this.flush_cb();
			    this.send_ok(socket);
			break;
			case 1:
				this.send_ok(socket);
			break;
			case 2:
				this.send_ok(socket);
			break;
			case 3:
				this.send_ok(socket);
			break;
			case 4:
				//console.log("----------------------Try-Delay");
				this.send_ok(socket);
			break;
			case 5:

				if(this.busy_flag==true){
					this.send_busy(socket);
					break;
				}else{
					this.send_ok(socket);
				}
                this.delay=0;
				for(let i=4;i<data.length;i+=4){
					let delay = data[i]<<8;
					delay |= data[i+1];
					this.delay+=delay;
					//console.log('Delay: ' + delay + ' Register: ' + data[i+2] + ' Value: ' + data[i+3])
					if(data[i+2]<25){
						this.registers[data[i+2]+4] = data[i+3];
					}
				}
                //console.log(this.ud_time);
                this.registers[32] = (this.ud_time[0] & 0xFF);
                this.registers[31] = (this.ud_time[0]>>8) & 0xFF;
                this.registers[30] = (this.ud_time[0]>>16) & 0xFF;
				this.registers[29] = (this.ud_time[0]>>24) & 0xFF;
				//console.log(this.delay / 3.125);
				this.data_cb(this.registers);
				//console.log(this.ud_time[0]);
				this.ud_time[0] = this.ud_time[0] - Math.floor(this.delay / 3.125);  //3.125us Tick Time of SG-Timer in UD3


			break;
			case 6:
				this.send_ok(socket);
			break;
			case 7:
				this.send_version(socket,2);
			break;
			case 8:
				this.send_ok(socket);
			break;
			case 9:
				this.send_ok(socket);
			break;
			case 10:
				this.send_count(socket,1);
			break;
			case 11:
				let MOS_6581 = 0
				let MOS_8580 = 1
				this.send_info(socket,MOS_6581,this.name);
			break;
			case 12:
				this.send_ok(socket);
			break;
			case 14:
				this.send_ok(socket);
			break;
		}
	}
}