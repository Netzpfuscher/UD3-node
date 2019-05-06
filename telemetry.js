module.exports = class ttprot{
	constructor() {
		this.term_state=0;
		this.TT_STATE_IDLE = 0;
		this.TT_STATE_FRAME = 1;
		this.TT_STATE_COLLECT = 3;
		this.receive.buffer = [];
		this.receive.bytes_done=0;
		this.onreceive=0;
		
		this.DATA_TYPE = 0;
		this.DATA_LEN = 1;
		this.DATA_NUM = 2;
		
		this.gauges = [];
		
		this.setBusActive=0;
		this.setTransientActive=0;
		this.setBusControllable=0;
		
		this.cbGaugeValue = 0;
		
	}
	
	receive(buf){
		for (let i = 0; i < buf.length; i++) {
			switch(this.term_state){
				case this.TT_STATE_IDLE:
					if(buf[i]== 0xff){
						this.term_state = TT_STATE_FRAME;
					}else{
						//var str = String.fromCharCode.apply(null, [buf[i]]);
						//terminal.io.print(str);
					}
				break;
					
				case this.TT_STATE_FRAME:
					receive.buffer[DATA_LEN]=buf[i];
					receive.bytes_done=0;
					this.term_state=TT_STATE_COLLECT;
				break;
				
				case this.TT_STATE_COLLECT:
					
					if(receive.bytes_done==0){
						receive.buffer[0] = buf[i];
						receive.bytes_done++;
						break;
					}else{
						
						if(receive.bytes_done<receive.buffer[DATA_LEN]-1){
							receive.buffer[receive.bytes_done+1]=buf[i]
							receive.bytes_done++;
						}else{
							receive.buffer[receive.bytes_done+1]=buf[i];
							receive.bytes_done=0;
							this.term_state=TT_STATE_IDLE;
							this.compute(receive.buffer);
							receive.buffer=[];
						}
					}
					
				break;
			}
		}
	}
	convertArrayBufferToString(buf, uri = true){
		let bufView = new Uint8Array(buf);
		let encodedString = String.fromCharCode.apply(null, bufView);
		if (uri) {
			return decodeURIComponent(encodedString);
		} else {
			return encodedString;
		}
	}
	bytes_to_signed(lsb, msb){
		let sign = msb & (1 << 7);
		let x = (((msb & 0xFF) << 8) | (lsb & 0xFF));
		if (sign) {
			return  (0xFFFF0000 | x);  // fill in most significant bits with 1's
		}else{
			return  x;
		}
	}
	
	compute(dat){
		let str;
		switch(dat[this.DATA_TYPE]){
			case TT_GAUGE:
				let value = this.bytes_to_signed(dat[3],dat[4]);
				if(this.gauges[dat[DATA_NUM]].value != value){
					this.gauges[dat[DATA_NUM]].value = value;
					if(this.cbGaugeValue){
						this.cbGaugeValue(this.gauges[dat[DATA_NUM]]);
					}
				}
				
			break;
			case TT_GAUGE_CONF:
				let gauge_num = dat[2].valueOf();
				let gauge_min = this.bytes_to_signed(dat[3],dat[4]);
				let gauge_max = this.bytes_to_signed(dat[5],dat[6]);
				dat.splice(0,7);
				str = this.convertArrayBufferToString(dat, false);
				this.gauges[gauge_num].name = str;
				this.gauges[gauge_num].min = gauge_min;
				this.gauges[gauge_num].max = gauge_max;
				console.log("TELEMETRY: New gauge conf num: " + gauge_num + " min: " + gauge_min + " max: " + gauge_max + " name: "+ str);
			break;
			case TT_STATE_SYNC:
				setBusActive((dat[2]&1)!=0);
				setTransientActive((dat[2]&2)!=0);
				setBusControllable((dat[2]&4)!=0);
				break;
			case TT_CONFIG_GET:
				dat.splice(0,2);
				str = this.convertArrayBufferToString(dat, false);
				if(str == "NULL;NULL"){
					//term_ui.ud_settings(udconfig);
				}else{
					let substrings = str.split(";")
					//udconfig.push(substrings);
				}
			break;
		}
	}
	
	
}