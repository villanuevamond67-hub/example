(function () {
    "use strict";

    const APP_KEYS = [
        "lghMedicationOrdersV1",
        "lghMedicationDatabaseV1",
        "lghDietListV1",
        "lghDietOptionsV1",
        "lghDietPrintPaperV1",
        "lghKardexExtrasV1",
        "lghVitalSignsSheetV1"
    ];
    // Form Heading Printer alignment profiles: heading-alignment-v1-<form>-<paper>.
    // Matched by prefix so a new form template is synced without editing this file.
    const ALIGNMENT_PREFIX = "heading-alignment-v1-";
    const LAST_USER_KEY = "risLastUserId";
    // Keys changed on this device whose cloud copy has not been confirmed yet.
    // Kept in localStorage so a closed tab, a reload or a dropped connection
    // can never turn an unsynced local edit into lost data.
    const PENDING_KEY = "risPendingSyncV1";
    const RETRY_FIRST_MS = 5000;
    const RETRY_MAX_MS = 60000;

    const pendingWrites = new Map();
    const writeTimers = new Map();
    let client = null;
    let user = null;
    let channel = null;
    let accountBar = null;
    let pending = { user: null, keys: {} };
    let retryTimer = null;
    let retryDelay = RETRY_FIRST_MS;
    let lastError = false;

    const STATE_TEXT = {
        synced: "Saved to cloud + this device",
        saving: "Saving\u2026",
        error: "Saved on this device \u00b7 retrying cloud"
    };

    function configured() {
        const config = window.RIS_SUPABASE_CONFIG || {};
        return /^https:\/\/.+\.supabase\.co\/?$/.test(config.url || "") &&
            config.anonKey && !config.anonKey.startsWith("YOUR_");
    }

    function configurationError() {
        return new Error("Supabase is not configured. Add the project URL and anon key in supabase-config.js.");
    }

    function isAppKey(key) {
        return APP_KEYS.includes(key) || (typeof key === "string" && key.startsWith(ALIGNMENT_PREFIX));
    }

    function rawGet(key) {
        try { return localStorage.getItem(key); } catch (_) { return null; }
    }

    function rawSet(key, value) {
        try { localStorage.setItem(key, String(value)); } catch (_) {}
    }

    function rawRemove(key) {
        try { localStorage.removeItem(key); } catch (_) {}
    }

    // Every key this app keeps in the browser, including alignment profiles.
    function localAppKeys() {
        const keys = new Set(APP_KEYS);
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(ALIGNMENT_PREFIX)) keys.add(key);
            }
        } catch (_) {}
        return [...keys];
    }

    function clearAppCache() {
        localAppKeys().forEach(rawRemove);
        rawRemove(PENDING_KEY);
        pending = { user: null, keys: {} };
    }

    /* ---------- Unsynced-change markers ---------- */

    function loadPending(userId) {
        try {
            const saved = JSON.parse(rawGet(PENDING_KEY));
            if (saved && saved.user === userId && saved.keys && typeof saved.keys === "object") {
                return { user: userId, keys: { ...saved.keys } };
            }
        } catch (_) {}
        return { user: userId, keys: {} };
    }

    function savePending() {
        if (Object.keys(pending.keys).length) rawSet(PENDING_KEY, JSON.stringify(pending));
        else rawRemove(PENDING_KEY);
    }

    function markPending(key, operation) {
        if (!user) return;
        pending.user = user.id;
        pending.keys[key] = operation;
        savePending();
    }

    function clearPending(key) {
        if (key in pending.keys) {
            delete pending.keys[key];
            savePending();
        }
    }

    function hasUnsynced() {
        return Object.keys(pending.keys).length > 0;
    }

    /* ---------- Status ---------- */

    function syncState() {
        if (!user) return "off";
        if (!hasUnsynced()) return "synced";
        return lastError ? "error" : "saving";
    }

    function updateStatus() {
        const state = syncState();
        window.dispatchEvent(new CustomEvent("ris-sync-state", { detail: { state } }));
        if (!accountBar) return;
        accountBar.classList.toggle("has-error", state === "error");
        accountBar.classList.toggle("is-saving", state === "saving");
        accountBar.querySelector(".ris-sync-text").textContent = STATE_TEXT[state] || "";
    }

    /* ---------- Cloud writes ---------- */

    function noteFailure(message) {
        lastError = true;
        console.error("RIS cloud save failed:", message);
        window.dispatchEvent(new CustomEvent("ris-cloud-error", { detail: message }));
        scheduleRetry();
        updateStatus();
    }

    function noteConfirmed(key) {
        if (!hasUnsynced()) {
            lastError = false;
            retryDelay = RETRY_FIRST_MS;
        }
        window.dispatchEvent(new CustomEvent("ris-cloud-saved", { detail: key }));
        updateStatus();
    }

    async function writeNow(key) {
        if (!client || !user || !pendingWrites.has(key)) return;
        const value = pendingWrites.get(key);
        pendingWrites.delete(key);
        // Any queued timer is obsolete now; a newer setItem during the request
        // will queue its own.
        clearTimeout(writeTimers.get(key));
        writeTimers.delete(key);

        let error = null;
        try {
            ({ error } = await client.from("ris_user_data").upsert({
                user_id: user.id,
                storage_key: key,
                value: value,
                updated_at: new Date().toISOString()
            }, { onConflict: "user_id,storage_key" }));
        } catch (caught) {
            error = caught;
        }

        if (error) {
            // A newer value queued during the request must not be replaced by this older one.
            if (!pendingWrites.has(key)) pendingWrites.set(key, value);
            noteFailure(error.message || String(error));
            return;
        }
        if (!pendingWrites.has(key) && !writeTimers.has(key)) clearPending(key);
        noteConfirmed(key);
    }

    function queueWrite(key, value) {
        if (!isAppKey(key) || !client || !user) return;
        markPending(key, "set");
        pendingWrites.set(key, String(value));
        clearTimeout(writeTimers.get(key));
        writeTimers.set(key, setTimeout(() => {
            writeTimers.delete(key);
            writeNow(key);
        }, 400));
        updateStatus();
    }

    async function removeCloudValue(key) {
        if (!isAppKey(key) || !client || !user) return;
        let error = null;
        try {
            ({ error } = await client.from("ris_user_data")
                .delete()
                .eq("user_id", user.id)
                .eq("storage_key", key));
        } catch (caught) {
            error = caught;
        }
        if (error) {
            noteFailure(error.message || String(error));
            return;
        }
        // Only clear the marker if the key was not written again meanwhile.
        if (pending.keys[key] === "remove") clearPending(key);
        noteConfirmed(key);
    }

    function pushLocalValue(key) {
        if (!pendingWrites.has(key)) {
            const value = rawGet(key);
            if (value === null) {
                clearPending(key);
                updateStatus();
                return Promise.resolve();
            }
            pendingWrites.set(key, value);
        }
        return writeNow(key);
    }

    // Send every change that the cloud has not confirmed yet.
    async function pushPending() {
        if (!client || !user) return;
        await Promise.all(Object.keys(pending.keys).map(key =>
            pending.keys[key] === "remove" ? removeCloudValue(key) : pushLocalValue(key)));
    }

    function scheduleRetry() {
        if (retryTimer || !client || !user) return;
        retryTimer = setTimeout(async () => {
            retryTimer = null;
            await pushPending();
        }, retryDelay);
        retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
    }

    window.RISStore = {
        getItem: rawGet,
        setItem(key, value) {
            rawSet(key, value);
            queueWrite(key, value);
        },
        removeItem(key) {
            rawRemove(key);
            if (isAppKey(key) && client && user) {
                // A queued write must not bring the key back after it is deleted.
                pendingWrites.delete(key);
                clearTimeout(writeTimers.get(key));
                writeTimers.delete(key);
                markPending(key, "remove");
                updateStatus();
            }
            removeCloudValue(key);
        },
        // Resolves true when the cloud has confirmed every change, false if
        // something is still waiting (it stays on this device and retries).
        async flush() {
            writeTimers.forEach(timer => clearTimeout(timer));
            writeTimers.clear();
            await pushPending();
            return !hasUnsynced();
        },
        hasUnsynced,
        status: syncState
    };

    function dispatchStorageChange(key, newValue) {
        window.dispatchEvent(new StorageEvent("storage", { key, newValue }));
        window.dispatchEvent(new CustomEvent("ris-cloud-change", { detail: { key, newValue } }));
    }

    /*
    Reconcile this browser with the cloud when the page opens.

    - A change made on this device that the cloud never confirmed wins, and
      is pushed now. Previously the cloud copy replaced it and it was lost.
    - Otherwise the cloud copy is the shared truth, as before.
    - A value that exists only on this device is uploaded on the first
      sign-in, and always for alignment profiles, which were browser-only
      before they were synced.
    - Another account's leftover data is cleared, never shown or uploaded.
    */
    async function hydrate() {
        const previousUser = rawGet(LAST_USER_KEY);
        const { data, error } = await client.from("ris_user_data")
            .select("storage_key,value")
            .eq("user_id", user.id);
        if (error) throw error;

        const cloud = new Map();
        (Array.isArray(data) ? data : []).forEach(row => {
            if (isAppKey(row.storage_key)) cloud.set(row.storage_key, row.value);
        });

        const sameUser = !previousUser || previousUser === user.id;
        if (!sameUser) clearAppCache();
        pending = sameUser ? loadPending(user.id) : { user: user.id, keys: {} };

        const upload = [];
        const remove = [];
        new Set([...localAppKeys(), ...cloud.keys()]).forEach(key => {
            const local = rawGet(key);
            const operation = pending.keys[key];
            if (operation === "remove") {
                rawRemove(key);
                remove.push(key);
            } else if (operation === "set" && local !== null) {
                upload.push(key);
            } else if (cloud.has(key)) {
                rawSet(key, cloud.get(key));
            } else if (local !== null) {
                const firstSync = cloud.size === 0 || key.startsWith(ALIGNMENT_PREFIX);
                if (sameUser && firstSync) upload.push(key);
                else rawRemove(key);
            }
        });

        pending = { user: user.id, keys: {} };
        upload.forEach(key => { pending.keys[key] = "set"; });
        remove.forEach(key => { pending.keys[key] = "remove"; });
        savePending();
        rawSet(LAST_USER_KEY, user.id);
        await pushPending();
    }

    function subscribe() {
        channel = client.channel("ris-user-data-" + user.id)
            .on("postgres_changes", {
                event: "*",
                schema: "public",
                table: "ris_user_data",
                filter: "user_id=eq." + user.id
            }, payload => {
                const key = payload.new?.storage_key || payload.old?.storage_key;
                if (!isAppKey(key)) return;
                // An unsynced local change is newer than this event and is
                // being pushed; applying the event would revert it.
                if (pending.keys[key]) return;
                const value = payload.eventType === "DELETE" ? null : payload.new.value;
                if (value === null) rawRemove(key); else rawSet(key, value);
                dispatchStorageChange(key, value);
            })
            .subscribe();
    }

    function addAccountBar() {
        const bar = document.createElement("div");
        bar.className = "ris-account-bar no-print";
        bar.innerHTML = `<span class="ris-sync-dot" aria-hidden="true"></span><span class="ris-sync-text" role="status" aria-live="polite"></span><span class="ris-account-email"></span><button type="button" class="ris-signout">SIGN OUT</button>`;
        bar.querySelector(".ris-account-email").textContent = user.email || "Signed in";
        bar.querySelector(".ris-signout").addEventListener("click", async () => {
            const synced = await window.RISStore.flush();
            if (!synced && !confirm("Some recent changes are saved only on this device and have not reached the cloud yet. Signing out now will lose them. Sign out anyway?")) {
                return;
            }
            if (channel) await client.removeChannel(channel);
            await client.auth.signOut();
            clearAppCache();
            location.replace("login.html");
        });
        document.body.appendChild(bar);
        accountBar = bar;
        updateStatus();
    }

    async function initialize(options) {
        if (!configured()) throw configurationError();
        if (!window.supabase?.createClient) throw new Error("Unable to load the Supabase client.");

        const config = window.RIS_SUPABASE_CONFIG;
        client = window.supabase.createClient(config.url, config.anonKey, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        window.RISSupabase = client;

        client.auth.onAuthStateChange(event => {
            if (event === "SIGNED_OUT" && !location.pathname.endsWith("login.html")) {
                clearAppCache();
                location.replace("login.html");
            }
        });

        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        user = data.session?.user || null;

        if (!user && options?.requireAuth !== false) {
            const next = encodeURIComponent(location.pathname.split("/").pop() + location.search);
            location.replace("login.html?next=" + next);
            return new Promise(() => {});
        }
        if (!user) return { client, user: null };

        await hydrate();
        subscribe();
        addAccountBar();
        document.documentElement.classList.add("ris-ready");
        return { client, user };
    }

    window.RISCloud = { initialize, configured, get client() { return client; }, get user() { return user; } };

    window.addEventListener("pagehide", () => window.RISStore.flush());
    // Anything still waiting is retried as soon as the connection or the tab returns.
    window.addEventListener("online", () => {
        retryDelay = RETRY_FIRST_MS;
        if (hasUnsynced()) pushPending();
    });
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && hasUnsynced()) pushPending();
    });
})();
