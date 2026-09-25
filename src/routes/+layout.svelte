<script lang="ts">
	import { onMount } from 'svelte';
	import { syncWithCloud } from '$lib/sync';
	import SyncStatusBadge from '$lib/components/SyncStatusBadge.svelte';
	import LoginPrompt from '$lib/components/LoginPrompt.svelte';

	// 1. Accept the 'children' snippet (replaces <slot>)
	let { children } = $props();

	// 2. Use $state so the UI updates when the event fires
	interface BeforeInstallPromptEvent extends Event {
		prompt(): Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	}
	let deferredPrompt = $state<BeforeInstallPromptEvent | null>(null);

	onMount(() => {
		window.addEventListener('beforeinstallprompt', (e: Event) => {
			// Prevent Chrome 67 and earlier from automatically showing the prompt
			e.preventDefault();
			// Stash the event so it can be triggered later
			deferredPrompt = e as BeforeInstallPromptEvent;
		});

		// Without this, sync only ever ran as a side effect of a local
		// write (a sale, a stock edit) — a device that reconnects without
		// touching anything locally would never pull anyone else's changes.
		void syncWithCloud();
		window.addEventListener('online', () => void syncWithCloud());
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

<SyncStatusBadge />
<LoginPrompt />

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