<script lang="ts">
	import { onMount } from 'svelte';

	// 1. Accept the 'children' snippet (replaces <slot>)
	let { children } = $props();

	// 2. Use $state so the UI updates when the event fires
	let deferredPrompt = $state < any > (null);

	onMount(() => {
		window.addEventListener('beforeinstallprompt', (e) => {
			// Prevent Chrome 67 and earlier from automatically showing the prompt
			e.preventDefault();
			// Stash the event so it can be triggered later
			deferredPrompt = e;
		});
	});

	async function installApp() {
		if (deferredPrompt) {
			deferredPrompt.prompt();
			const { outcome } = await deferredPrompt.userChoice;
			if (outcome === 'accepted') {
				deferredPrompt = null;
			}
		}
	}
</script>

<!-- 3. Render the page content here -->
{@render children()}

<!-- Only show the button if the app is installable -->
{#if deferredPrompt}
<div class="pwa-install-bar">
	<button onclick={installApp}>Install App</button>
</div>
{/if}

<style>
	/* Optional simple styling to make it look like a toast at the bottom */
	.pwa-install-bar {
		position: fixed;
		bottom: 20px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 1000;
	}
</style>