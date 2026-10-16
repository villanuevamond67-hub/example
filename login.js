(async function () {
    "use strict";
    const config = window.RIS_SUPABASE_CONFIG || {};
    const form = document.getElementById("loginForm");
    const signInButton = document.getElementById("signInButton");
    const createButton = document.getElementById("createAccountButton");
    const resetButton = document.getElementById("forgotPasswordButton");
    const message = document.getElementById("authMessage");
    let recoveryMode = new URLSearchParams(location.hash.slice(1)).get("type") === "recovery" ||
        new URLSearchParams(location.search).get("type") === "recovery";

    function show(text, type) {
        message.textContent = text;
        message.className = "auth-message " + (type || "");
    }

    function setBusy(busy) {
        [signInButton, createButton, resetButton].forEach(button => button.disabled = busy);
    }

    function nextPage() {
        const requested = new URLSearchParams(location.search).get("next") || "RIS_2.0_PATIENT_DASHBOARD.html";
        return /^[A-Za-z0-9_.-]+\.html(?:\?.*)?$/.test(requested)
            ? requested
            : "RIS_2.0_PATIENT_DASHBOARD.html";
    }

    if (!/^https:\/\/.+\.supabase\.co\/?$/.test(config.url || "") || !config.anonKey || config.anonKey.startsWith("YOUR_")) {
        show("Setup required: add the Supabase project URL and anon key to supabase-config.js.", "error");
        form.querySelectorAll("input, button").forEach(el => el.disabled = true);
        createButton.disabled = true;
        resetButton.disabled = true;
        return;
    }

    const client = window.supabase.createClient(config.url, config.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    function enterRecoveryMode() {
        recoveryMode = true;
        document.getElementById("loginTitle").textContent = "Set New Password";
        document.querySelector(".intro").textContent = "Enter a new password for your RIS account.";
        document.querySelector('label[for="email"]').hidden = true;
        document.getElementById("email").hidden = true;
        signInButton.textContent = "UPDATE PASSWORD";
        createButton.hidden = true;
        resetButton.hidden = true;
        show("");
    }

    client.auth.onAuthStateChange(event => {
        if (event === "PASSWORD_RECOVERY") enterRecoveryMode();
    });
    if (recoveryMode) enterRecoveryMode();

    const { data } = await client.auth.getSession();
    if (data.session && !recoveryMode) {
        location.replace(nextPage());
        return;
    }

    form.addEventListener("submit", async event => {
        event.preventDefault();
        setBusy(true);
        show(recoveryMode ? "Updating password…" : "Signing in…");
        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        const { error } = recoveryMode
            ? await client.auth.updateUser({ password })
            : await client.auth.signInWithPassword({ email, password });
        setBusy(false);
        if (error) return show(error.message, "error");
        location.replace(nextPage());
    });

    createButton.addEventListener("click", async () => {
        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        if (!email || password.length < 8) return show("Enter an email and a password of at least 8 characters.", "error");
        setBusy(true);
        show("Creating account…");
        const redirectTo = new URL("login.html", location.href).href;
        const { data: signUpData, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
        setBusy(false);
        if (error) return show(error.message, "error");
        if (signUpData.session) location.replace(nextPage());
        else show("Account created. Check your email to confirm it, then sign in.", "success");
    });

    resetButton.addEventListener("click", async () => {
        const email = document.getElementById("email").value.trim();
        if (!email) return show("Enter your email address first.", "error");
        setBusy(true);
        const redirectTo = new URL("login.html", location.href).href;
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
        setBusy(false);
        show(error ? error.message : "Password reset instructions sent.", error ? "error" : "success");
    });
})();
