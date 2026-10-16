(function () {
    "use strict";
    const loader = document.currentScript;
    const appScript = loader?.dataset.appScript;
    // Optional add-on scripts (comma-separated) loaded after the page script.
    const afterScripts = (loader?.dataset.afterScript || "").split(",").map(item => item.trim()).filter(Boolean);

    function showFatal(error) {
        const panel = document.createElement("div");
        panel.className = "ris-fatal-error";
        panel.innerHTML = "<strong>RIS could not start.</strong><p></p><a href=\"login.html\">Return to sign in</a>";
        panel.querySelector("p").textContent = error?.message || "Unknown startup error.";
        document.body.appendChild(panel);
    }

    window.RIS_BOOTSTRAP = window.RISCloud.initialize({ requireAuth: true });
    window.RIS_BOOTSTRAP.then(() => {
        if (!appScript) return;
        const script = document.createElement("script");
        script.src = appScript;
        script.onerror = () => showFatal(new Error("Unable to load " + appScript));
        script.onload = () => afterScripts.forEach(src => {
            const extra = document.createElement("script");
            extra.src = src;
            extra.onerror = () => console.error("Unable to load add-on " + src);
            document.body.appendChild(extra);
        });
        document.body.appendChild(script);
    }).catch(showFatal);
})();
