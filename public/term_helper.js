class helper {
	static bytes_to_signed(lsb, msb){
		let sign = msb & (1 << 7);
		let x = (((msb & 0xFF) << 8) | (lsb & 0xFF));
		if (sign) {
			return  (0xFFFF0000 | x);  // fill in most significant bits with 1's
		}else{
			return  x;
		}
	}

    static bytes_to_signed32(lsb0, lsb1, lsb2 ,msb){
        let x = (((msb & 0xFF) << 24) | ((msb & 0xFF) << 16) | ((lsb1 & 0xFF) << 8) |(lsb0 & 0xFF));
        return x;
    }

	static convertArrayBufferToString(buf, uri = true){
		let bufView = new Uint8Array(buf);
		let encodedString = String.fromCharCode.apply(null, bufView);
		if (uri) {
			return decodeURIComponent(encodedString);
		} else {
			return encodedString;
		}
	}

	static convertStringToArrayBuffer(str) {
		let buf=new ArrayBuffer(str.length);
		let bufView=new Uint8Array(buf);
		for (let i=0; i<str.length; i++) {
			bufView[i]=str.charCodeAt(i);
		}
		return buf;
	}

	static ascii_to_hex(str) {
		let arr1 = [];
		for (let n = 0, l = str.length; n < l; n ++) {
			let hex = Number(str.charCodeAt(n)).toString(16);
			arr1.push(hex);
			arr1.push(' ');
		}
	return arr1.join('');
   }

	static changeMenuEntry(menu, id, newName) {
		let items = $('#toolbar').w2toolbar().get(menu, false).items;
		for (let i = 0;i<items.length;i++) {
			if (items[i].id==id) {
				items[i].text = newName;
				$('#toolbar').w2toolbar().set(menu, items);
				return;
			}
		}
		console.log("Didn't find name to replace!");
	}

	static parseFilter(str) {
		if (str=="") {
			return [];
		}
		if (!/^(\d+(-\d+)?)(,\d+(-\d+)?)*$/.test(str)) {
			return null;
		}
		let ret = [];
		const sections = str.split(",");
		for (let i = 0;i<sections.length;i++) {
			const bounds = sections[i].split("-");
			if (bounds.length<2) {
				const bound = parseInt(bounds[0]);
				ret.push([bound, bound]);
			} else {
				const lower = parseInt(bounds[0]);
				const upper = parseInt(bounds[1]);
				if (lower>upper) {
					return null;
				}
				ret.push([lower, upper]);
			}
		}
		return ret;
	}

	static matchesFilter(filter, num) {
		for (let i = 0;i<filter.length;i++) {
			if (filter[i][0]<=num && num<=filter[i][1]) {
				return true;
			}
		}
		return false;
	}

	static addFirstMenuEntry(menu, id, text, icon) {
		const mnu = $('#toolbar').w2toolbar().get(menu, false);
		mnu.items = [{text: text, icon: icon, id: id}].concat(mnu.items);
	}

	static removeMenuEntry(menu, id) {
		const mnu = $('#toolbar').w2toolbar().get(menu, false);
		let items = mnu.items;
		for (let i = 0;i<items.length;i++) {
			if (items[i].id==id) {
				mnu.items.splice(i, 1);
				return;
			}
		}
		console.log("Didn't find name to remove!");
	}
}

class cls_meter {
	constructor(meters){
		this.num_meters=meters;
		this.meter_buf_old = [];
		this.meter_buf = [];
		this.g = [];
		this.div = [];

		for(let i=0;i<this.num_meters;i++){
			this.meter_buf_old[i]=255;
			this.meter_buf[i]=0;
			this.div[i]=0;
			this.g[i]= new JustGage({
				id: ("gauge"+i),
				value: 255,
				min: 0,
				max: 255,
                humanFriendly: true,
                humanFriendlyDecimal: 1,
				label: ("Gauge"+i)
			});
		}

	}

	refresh_all(){
		for(let i=0;i<this.num_meters;i++){
			this.g[i].refresh(this.meter_buf[i]);
		}
	}

	refresh(){
		for(let i=0;i<this.num_meters;i++){
			if(this.meter_buf[i]!=this.meter_buf_old[i]){
				this.g[i].refresh(this.meter_buf[i]);
				this.meter_buf_old[i]=this.meter_buf[i];
			}
		}
	}

	value(num, value){
		if(num<this.num_meters){
			if(this.div[num]==0) {
                this.meter_buf[num] = value;
            }else{
                this.meter_buf[num] = value/this.div[num];
			}
		}else{
			console.log('Meter: '+num+'not found');
		}
	}

    min_max_label(num, min, max, label){
        if(num<this.num_meters){
            this.g[num].refresh( this.meter_buf[num], max, min, label);
        }else{
            console.log('Meter: '+num+'not found');
        }
    }
/*
	text(num,text){
		if(num<this.num_meters){
			//this.g[num].refreshTitle(text);
            this.g[num].config.label = text;
		}else{
			console.log('Meter: '+num+'not found');
		}
	}

	range(num, min, max){
		if(num<this.num_meters){
			this.g[num].refresh(max);
		}else{
			console.log('Meter: '+num+'not found');
		}
	}*/
}
