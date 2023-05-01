/* @refresh reload */
import { Component, createEffect, createSignal } from "solid-js";

const [selected, setSelected] = createSignal(0);

export function nav(at: number = 0, max: number = Infinity) {
	const current = selected(),
		next = current + at;
	if (current === next) return current;
	if (next > max) {
		return setSelected(max);
	}
	setSelected(Math.max(0, next));
}

function ListItem({ index, ssid, psk }: { index: number; ssid: string; psk: string }) {
	let el: HTMLDivElement;

	createEffect(() => {
		if (el && selected() === index) {
			el.scrollIntoView(false);
		}
	});

	return (
		<div
			ref={el}
			classList={{
				"list-item": true,
				selected: selected() === index,
			}}
		>
			<p class="list-item__text">{ssid}</p>
			<p class="list-item__subtext">{psk}</p>
		</div>
	);
}

export default ListItem as Component;
