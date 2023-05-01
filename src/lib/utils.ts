interface DOMRequest<T = unknown> {
	onsuccess: () => void;
	onerror: () => void;
	result: T;
	error: Error;
}

export interface MozWifiNetwork {
	ssid: string;
	bssid: string;
	capabilities: string[];
	security: string[];
	signalStrength: number;
	relSignalStrength: number;
	connected: boolean;
	known: boolean;
	hidden: boolean;
}

export function generateWifiQR({ ssid, type, psk, hidden }: { ssid?: string; type?: string; psk?: string; hidden?: boolean }) {
	let string = "WIFI:";
	if (ssid) string += `S:${ssid};`;
	if (type) string += `T:${type};`;
	if (psk) string += `P:${psk};`;
	if (typeof hidden == "boolean") string += `H:${hidden};`;
	if (string == "WIFI:") return null;
	return string + ";";
}

export function DOMRequestPromise(request: DOMRequest) {
	return new Promise((res, err) => {
		request.onsuccess = () => res(request.result);
		request.onerror = () => err(request.error);
	});
}

export function parseQRWlan(string: string) {
	if (!/^WIFI:/.test(string)) return null;
	const arr = string.replace("WIFI:", "").split(";"),
		dict = {
			P: "psk",
			T: "type",
			S: "ssid",
			H: "hidden",
		} as const,
		obj = {} as Record<QRAttributes, string | boolean>;

	type Keys = keyof typeof dict;
	type QRAttributes = (typeof dict)[Keys];

	arr.forEach((a) => {
		if (a == "") return;
		let [_key, val] = a.split(":") as [Keys, string];
		let key = dict[_key];
		if (_key == "H") {
			obj[key] = val === "true";
			return;
		}
		obj[key] = val;
	});
	return obj;
}

export const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
