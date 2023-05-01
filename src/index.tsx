/* @refresh reload */
import { render } from "solid-js/web";
import { Component, For, Index, createSignal, onCleanup, onMount } from "solid-js";

import qrjs from "./lib/qr.js";
import ListItem, { nav } from "./components/ListItem";
import { DOMRequestPromise, MozWifiNetwork, generateWifiQR, parseQRWlan, sleep } from "./lib/utils.js";

const [networks, setNetworks] = createSignal<MozWifiNetwork[] | PasswordObject[]>([]);
const passwords: PasswordObject[] = [];
const [showQR, toggleQR] = createSignal(false);

let qrcodeCanvas: HTMLCanvasElement;

window.onkeydown = (e: KeyboardEvent) => {
	if (showQR() && e.key == "Backspace") {
		return false;
	}
};

const onKeydown = async (e: KeyboardEvent) => {
	const { key } = e;
	if (showQR()) {
		if (key == "BackSpace") {
			e.preventDefault();
			await sleep(10);
		}
		toggleQR(false);
		return;
	}

	const _networks = networks();
	if (/Arrow(Up|Down)/.test(key)) {
		nav(key.endsWith("Up") ? -1 : 1, _networks.length - 1);
	}
	if (key == "Enter") {
		const index = nav();
		const network = _networks[index];

		let type = "WPA",
			hidden,
			psk = passwords[index]?.psk;

		if ("security" in network && "hidden" in network) {
			hidden = network.hidden;
			type = network.security[0];
		}
		if (!psk && "psk" in network) {
			psk = network.psk;
		}

		qrjs(generateWifiQR({ ssid: network.ssid, type, psk, hidden }), 190, qrcodeCanvas);
		await sleep(1);
		toggleQR(true);
	}
	if (key == "SoftLeft" && "MozActivity" in window) {
		// @ts-ignore KAI
		if (!navigator.mozWifiManager?.enabled) {
			return alert("wifi is not enabled, please enable it first and restart the app.");
		}
		// @ts-ignore KAI
		let scan_result: string = await DOMRequestPromise(new MozActivity({ name: "_managerQR" }));

		let { psk, type, ssid, hidden } = parseQRWlan(scan_result);
		if (hidden)
			return alert(
				"sorry this app does not support hidden wifi networks, \n" +
					"cyan does not have a wifi router to test\n" +
					`as a fallback here is the json file: ${JSON.stringify({ psk, type, ssid, hidden })}`
			);
		// assume, idk how it works really
		// i do not have proper documentation
		// on how wlan qrcodes work, but wikipedia
		// states that it's WEP|WPA|<empty string>
		if (psk && type == "WPA") type = "WPA-PSK";
		// function fallback() {
		// 	let new_network = new MozWifiNetwork({
		// 		ssid,
		// 		psk,
		// 		password: psk,
		// 		security: [type],
		// 		hidden,
		// 	});
		// 	let associate = navigator.mozWifiManager.associate(new_network);
		// 	associate.onsuccess = associate_success;
		// 	associate.onerror = associate_error;
		// 	console.log(new_network);
		// 	alert(
		// 		"the network was assigned through fallback,\n" +
		// 			"therefore it may not work correctly, \n" +
		// 			`here is the json format ${JSON.stringify({ psk, type, ssid, hidden })}\n` +
		// 			"fallback should happen if there's no way of knowing the available networks"
		// 	);
		// }

		// @ts-ignore KAI
		let scan_network = DOMRequestPromise(navigator.mozWifiManager.getNetworks()).then((scan_network_result: MozWifiNetwork[]) => {
			const result = scan_network_result;
			if (result.length == 0) return; // fallback();
			console.log("networks found =>", result);
			const find = result.find((a) => a.ssid == ssid);
			if (find) {
				// @ts-ignore KAI
				find.psk = psk || null;
				// @ts-ignore KAI
				find.password = psk || null;
				// @ts-ignore KAI
				find.keyManagement = type;

				// @ts-ignore KAI
				const associate = navigator.mozWifiManager.associate(find);
				const cb = () => console.log(associate);
				DOMRequestPromise(associate).then(cb, cb);

				console.log(find);
			} else {
				alert("The network wasn't found");
			} // else fallback();
		});

		// scan_network.onerror = fallback;

		console.log("qrcode result: " + scan_result);
	}
};

async function getKnownNetworks(arr: PasswordObject[] = []) {
	// @ts-ignore KAI
	return DOMRequestPromise(navigator.mozWifiManager?.getKnownNetworks?.()).then(
		(result: MozWifiNetwork[]) => {
			// window.unsift = result;
			const sift = result.filter((a, i) => {
				const found = arr.find((e) => e.ssid == a.ssid);
				if (found) passwords.push(found);
				return found;
			});
			console.log(passwords);
			console.log(sift);
			return sift;
		},
		(err) => {
			alert("Error occured while getting known networks");
			console.error(err);
			throw err;
		}
	);
}

interface PasswordObject {
	ssid: string;
	psk: string;
}

async function getWifiPasswords(): Promise<PasswordObject[]> {
	return new Promise((res, err) => {
		// @ts-ignore KAI
		if (navigator && navigator.engmodeExtension) {
			// @ts-ignore KAI
			if (navigator.getDeviceStorages) {
				// @ts-ignore KAI
				let storage = navigator.getDeviceStorages("sdcard")[0];

				// @ts-ignore KAI
				DOMRequestPromise(navigator.engmodeExtension.startUniversalCommand(`cat /data/misc/wifi/wpa_supplicant.conf > ${storage.storagePath}/wifi_manager.txt`, true)).then(
					() => {
						// @ts-ignore KAI
						DOMRequestPromise(storage.get("wifi_manager.txt")).then(
							(result: Blob) => {
								let reader = new FileReader();
								reader.onload = function () {
									console.log(this.result);
									const _result = this.result as string;
									let arr = _result
										.match(/network={([^}]*)}/g)
										.map((a) => {
											let obj = {};
											a.replace(/network={\n|\n}|\t/g, "")
												.split("\n")
												.forEach((a) => {
													let split = a.split("=");
													split[1] = split[1].replace(/"/g, "");
													obj[split[0]] = split[1];
												});
											return obj as { ssid: string; psk: string };
										})
										.filter((a) => a.psk);
									console.log(arr);
									res(arr);
								};
								reader.onerror = function () {
									console.error(this);
									alert("error occured while reading file, please check console");
								};
								reader.readAsText(result);
							},
							(err) => {
								console.error(err);
								alert("error happened while fetching file, see console");
							}
						);
					},
					(err) => {
						console.error(err);
						alert("engmode doesn't work");
					}
				);
			} else alert("device storage not found");
		} else alert("engmode not found");
	});
}

const App: Component = () => {
	onMount(async () => {
		window.addEventListener("keydown", onKeydown);

		if (!import.meta.env.DEV) {
			const passwords = await getWifiPasswords();
			setNetworks(passwords);
			// @ts-ignore KAI
			if (!navigator.mozWifiManager?.enabled) return;
			const known = await getKnownNetworks(passwords);
			setNetworks(known);
			console.log(known);
		} else {
			setNetworks(Array(11).fill({ ssid: "TEST", psk: "TEST" }));
		}
	});

	onCleanup(() => window.removeEventListener("keydown", onKeydown));

	return (
		<>
			<div id="app">
				<div id="header">Wifi Passwords</div>
				<div id="content">
					<Index each={networks()}>
						{(a, i) => (
							<ListItem
								{...a}
								// @ts-ignore dunno why this gets a warning
								index={i}
								psk={passwords[i]?.psk}
							/>
						)}
					</Index>
				</div>
				<div class="softkeys">
					<div class="softkey softkey-left">Scan QR</div>
					<div class="softkey softkey-center">Gen. QR</div>
					<div class="softkey softkey-right"></div>
				</div>
			</div>
			<div id="qr" style={{ visibility: showQR() ? null : "hidden" }}>
				<div id="qrcode">
					<canvas ref={qrcodeCanvas} id="_qrcode"></canvas>
				</div>
			</div>
		</>
	);
};

const dispose = render(() => <App />, document.body);

if (import.meta.hot) {
	import.meta.hot.accept();
	import.meta.hot.dispose(dispose);
}

if (import.meta.env.DEV) {
	console.log("DEV MODE");
	function softkey(e: KeyboardEvent) {
		const { target, key, bubbles, cancelable, repeat, type } = e;
		if (!/Left|Right/.test(key) || !key.startsWith("Arrow") || !e.ctrlKey) return;
		e.stopImmediatePropagation();
		e.stopPropagation();
		e.preventDefault();
		target.dispatchEvent(new KeyboardEvent(type, { key: "Soft" + key.slice(5), bubbles, cancelable, repeat }));
	}

	document.addEventListener("keyup", softkey, true);
	document.addEventListener("keydown", softkey, true);
}
