<script lang="ts">
    import { login } from "$lib/client-auth";

    let { onLoggedIn }: { onLoggedIn: () => void } = $props();

    let username = $state("");
    let password = $state("");
    let error = $state("");
    let submitting = $state(false);

    async function handleSubmit(e: SubmitEvent) {
        e.preventDefault();
        submitting = true;
        error = "";

        const result = await login(username, password);
        submitting = false;

        if (!result.ok) {
            error = result.error;
            return;
        }

        onLoggedIn();
    }
</script>

<div class="login-wall">
    <form class="login-card" onsubmit={handleSubmit}>
        <h1>You and Gee</h1>
        <p class="subtitle">Sign in to continue</p>
        <input type="text" placeholder="Username" bind:value={username} autocomplete="username" required />
        <input type="password" placeholder="Password" bind:value={password} autocomplete="current-password" required />
        <button type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</button>
        {#if error}<p class="error">{error}</p>{/if}
        <p class="hint">Signing in requires a network connection once. After that, the app works fully offline until you sign out or this device's session expires.</p>
    </form>
</div>

<style>
    .login-wall {
        position: fixed;
        inset: 0;
        z-index: 2000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f8f9fa;
        padding: 20px;
        box-sizing: border-box;
    }

    .login-card {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
        max-width: 320px;
        padding: 32px;
        border-radius: 16px;
        background: white;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
        text-align: center;
    }

    h1 {
        margin: 0;
        font-size: 1.4rem;
        color: #2d3748;
    }

    .subtitle {
        margin: 0 0 8px;
        color: #718096;
        font-size: 0.9rem;
    }

    input {
        padding: 10px;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        font-size: 14px;
    }

    button[type="submit"] {
        padding: 10px;
        border: none;
        border-radius: 6px;
        background: #3182ce;
        color: white;
        font-weight: 600;
        cursor: pointer;
    }

    button[type="submit"]:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .error {
        margin: 0;
        color: #c53030;
        font-size: 0.85rem;
    }

    .hint {
        margin: 8px 0 0;
        color: #a0aec0;
        font-size: 0.75rem;
        line-height: 1.4;
    }
</style>
