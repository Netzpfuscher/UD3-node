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
        
        this.received_gauge_conf=false;
		
		this.gauges = [];
		
		this.setBusActive=0;
		this.setTransientActive=0;
		this.setBusControllable=0;
		
		this.cbGaugeValue = 0;
        this.cbEvent = 0;
        
        this.TT_GAUGE = 1;
        this.TT_GAUGE_CONF = 2;
        this.TT_CHART = 3;
        this.TT_CHART_DRAW = 4;
        this.TT_CHART_CONF = 5;
        this.TT_CHART_CLEAR = 6;
        this.TT_CHART_LINE = 7;
        this.TT_CHART_TEXT = 8;
        this.TT_CHART_TEXT_CENTER = 9;
        this.TT_STATE_SYNC = 10;
        this.TT_CONFIG_GET = 11;
        this.TT_EVENT = 12;
        this.TT_GAUGE32 = 13;
        this.TT_GAUGE_CONF32 = 14;

        this.TT_UNIT_NONE = 0;
        this.TT_UNIT_V = 1;
        this.TT_UNIT_A = 2;
        this.TT_UNIT_W = 3;
        this.TT_UNIT_Hz = 4;
        this.TT_UNIT_C = 5;
        this.TT_UNIT_kW = 6;
        this.TT_UNIT_RPM = 7;

        this.TYPE_UNSIGNED = 0;
        this.TYPE_SIGNED = 1;
        this.TYPE_FLOAT = 2;
        this.TYPE_CHAR = 3;
        this.TYPE_STRING = 4;
		
	}
	
	receive(buf){
		for (let i = 0; i < buf.length; i++) {
			switch(this.term_state){
				case this.TT_STATE_IDLE:
					if(buf[i]== 0xff){
						this.term_state = this.TT_STATE_FRAME;
					}else{
						//var str = String.fromCharCode.apply(null, [buf[i]]);
						//terminal.io.print(str);
					}
				break;
					
				case this.TT_STATE_FRAME:
					this.receive.buffer[this.DATA_LEN]=buf[i];
					this.receive.bytes_done=0;
					this.term_state=this.TT_STATE_COLLECT;
				break;
				
				case this.TT_STATE_COLLECT:
					
					if(this.receive.bytes_done==0){
						this.receive.buffer[0] = buf[i];
						this.receive.bytes_done++;
						break;
					}else{
						
						if(this.receive.bytes_done<this.receive.buffer[this.DATA_LEN]-1){
							this.receive.buffer[this.receive.bytes_done+1]=buf[i]
							this.receive.bytes_done++;
						}else{
							this.receive.buffer[this.receive.bytes_done+1]=buf[i];
							this.receive.bytes_done=0;
							this.term_state=this.TT_STATE_IDLE;
							this.compute(this.receive.buffer);
							this.receive.buffer=[];
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

    bytes_to_signed32(lsb0, lsb1, lsb2 ,msb){
        let x = (((msb & 0xFF) << 24) | ((msb & 0xFF) << 16) | ((lsb1 & 0xFF) << 8) |(lsb0 & 0xFF));
        return x;
    }
	
	compute(dat){
		let str;
		let value;
        let gauge_num;
        let gauge_min;
        let gauge_max;
        let gauge_div;
		switch(dat[this.DATA_TYPE]){
			case this.TT_GAUGE:
				value = this.bytes_to_signed(dat[3],dat[4]);
                if(typeof this.gauges[dat[this.DATA_NUM]] == 'undefined') break;
				if(this.gauges[dat[this.DATA_NUM]].value != value){
					this.gauges[dat[this.DATA_NUM]].value = value;
					if(this.cbGaugeValue){
						this.cbGaugeValue(this.gauges[dat[this.DATA_NUM]]);
					}
				}
				
			break;
			case this.TT_GAUGE_CONF:
				gauge_num = dat[2].valueOf();
				gauge_min = this.bytes_to_signed(dat[3],dat[4]);
				gauge_max = this.bytes_to_signed(dat[5],dat[6]);
				dat.splice(0,7);
				str = this.convertArrayBufferToString(dat, false).toLowerCase().replace(' ','_').replace('.','');
                console.log("TELEMETRY: New gauge conf num: " + gauge_num + " min: " + gauge_min + " max: " + gauge_max + " name: "+ str);
                this.gauges[gauge_num] = {'name': str, 'min': gauge_min, 'max':gauge_max, 'value':-1, 'div':0};
			break;
            case TT_GAUGE32:
                value = this.bytes_to_signed32(dat[3],dat[4],dat[5],dat[6]);
                if(typeof this.gauges[dat[this.DATA_NUM]] == 'undefined') break;
                if(this.gauges[dat[this.DATA_NUM]].value != value){
                    this.gauges[dat[this.DATA_NUM]].value = value;
                    if(this.cbGaugeValue){
                        this.cbGaugeValue(this.gauges[dat[this.DATA_NUM]]);
                    }
                }
                break;
            case TT_GAUGE_CONF32:
                gauge_num = dat[2].valueOf();
                gauge_min = helper.bytes_to_signed32(dat[3],dat[4],dat[5],dat[6]);
                gauge_max = helper.bytes_to_signed32(dat[7],dat[8],dat[9],dat[10]);
                gauge_div = helper.bytes_to_signed32(dat[11],dat[12],dat[13],dat[14]);
                dat.splice(0,15);
                str = helper.convertArrayBufferToString(dat);
                console.log("TELEMETRY: New gauge conf num: " + gauge_num + " min: " + gauge_min + " max: " + gauge_max + " div: " + gauge_div + " name: "+ str);
                this.gauges[gauge_num] = {'name': str, 'min': gauge_min, 'max':gauge_max, 'value':-1, 'div':gauge_div};
                break;
			case this.TT_STATE_SYNC:
				//setBusActive((dat[2]&1)!=0);
				//setTransientActive((dat[2]&2)!=0);
				//setBusControllable((dat[2]&4)!=0);
				break;
			case this.TT_CONFIG_GET:
				dat.splice(0,2);
				str = this.convertArrayBufferToString(dat, false);
				if(str == "NULL;NULL"){
					//term_ui.ud_settings(udconfig);
				}else{
					let substrings = str.split(";")
					//udconfig.push(substrings);
				}
			break;
            case this.TT_EVENT:
				dat.splice(0,2);
				str = this.convertArrayBufferToString(dat, false);
				if(this.cbEvent){
						this.cbEvent(str);
					}
	
			break;
		}
	}
	
	
}