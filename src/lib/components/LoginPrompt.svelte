<script lang="ts">
    import { login, isLoggedIn } from "$lib/client-auth";
    import { syncWithCloud } from "$lib/sync";

    let loggedIn = $state(isLoggedIn());
    let showForm = $state(false);
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

        loggedIn = true;
        showForm = false;
        username = "";
        password = "";
        void syncWithCloud();
    }
</script>

{#if !loggedIn}
    {#if showForm}
        <form class="login-form" onsubmit={handleSubmit}>
            <input type="text" placeholder="Username" bind:value={username} autocomplete="username" required />
            <input type="password" placeholder="Password" bind:value={password} autocomplete="current-password" required />
            <button type="submit" disabled={submitting}>{submitting ? "Logging in…" : "Log in"}</button>
            <button type="button" class="cancel" onclick={() => (showForm = false)}>Cancel</button>
            {#if error}<p class="error">{error}</p>{/if}
        </form>
    {:else}
        <button class="login-link" onclick={() => (showForm = true)}>
            🔒 Not synced — log in
        </button>
    {/if}
{/if}

<style>
    .login-link {
        position: fixed;
        top: 12px;
        left: 12px;
        z-index: 1000;
        padding: 6px 12px;
        border-radius: 999px;
        border: none;
        background: #fefcbf;
        color: #744210;
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
    }

    .login-form {
        position: fixed;
        top: 12px;
        left: 12px;
        z-index: 1000;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px;
        border-radius: 12px;
        background: white;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        width: 220px;
    }

    .login-form input {
        padding: 8px;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        font-size: 14px;
    }

    .login-form button[type="submit"] {
        padding: 8px;
        border: none;
        border-radius: 6px;
        background: #3182ce;
        color: white;
        font-weight: 600;
        cursor: pointer;
    }

    .login-form button[type="submit"]:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .login-form button.cancel {
        padding: 4px;
        border: none;
        background: transparent;
        color: #718096;
        font-size: 0.8rem;
        cursor: pointer;
    }

    .error {
        margin: 0;
        color: #c53030;
        font-size: 0.8rem;
    }
</style>
