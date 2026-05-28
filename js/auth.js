const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const LOGIN_REQUEST_TIMEOUT_MS = 15000;
const SEARCH_REQUEST_TIMEOUT_MS = 15000;

async function login(event) {
    event.preventDefault();

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const alertBox = document.getElementById("alert-box");
    const loginBtn = document.getElementById("login-btn");

    alertBox.textContent = "";
    alertBox.className = "text-sm min-h-5";

    if (!username || !password) {
        alertBox.textContent = "กรุณากรอก User Code/Email และ Password";
        alertBox.classList.add("error");
        return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = "กำลังเข้าสู่ระบบ...";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LOGIN_REQUEST_TIMEOUT_MS);

    try {
        const payload = {
            action: "login",
            username,
            password,
            // ส่ง key สำรองเพื่อรองรับ backend ที่ใช้ชื่อฟิลด์ต่างกัน
            email: username,
            userCode: username,
        };

        const response = await fetch(GAS_API_URL, {
            method: "POST",
            // ไม่กำหนด Content-Type เพื่อหลีกเลี่ยง CORS preflight (OPTIONS)
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        const rawText = await response.text();
        let result;

        try {
            result = JSON.parse(rawText);
        } catch {
            throw new Error("รูปแบบข้อมูลตอบกลับไม่ถูกต้อง");
        }

        if (!response.ok || result.success === false) {
            throw new Error(result.message || "เข้าสู่ระบบไม่สำเร็จ");
        }

        const userData = result.user || result.data || {};
        const userCode = userData.userCode || userData.user_code || userData.code || result.userCode || result.user_code || result.code || username;
        const name = userData.name || userData.fullName || userData.full_name || result.name || result.fullName || result.full_name || username;

        const roleRaw = userData.role || userData.userRole || userData.user_role || result.role || result.userRole || result.user_role;
        let role = String(roleRaw || "").trim().toLowerCase();

        // Fallback role จาก userCode เมื่อ backend ไม่ส่ง role กลับมา
        if (!role) {
            const normalizedCode = String(userCode || "").trim().toLowerCase();
            if (normalizedCode.startsWith("admin")) {
                role = "admin";
            } else if (normalizedCode.startsWith("staff")) {
                role = "staff";
            } else {
                role = "school";
            }
        }

        // รองรับคำ role ที่อาจส่งมาไม่ตรงรูปแบบ
        if (role === "administrator") role = "admin";
        if (role === "teacher") role = "school";
        if (!["admin", "staff", "school"].includes(role)) role = "school";

        const areaService =
            userData.areaService ||
            userData.area_service ||
            result.areaService ||
            result.area_service ||
            "ไม่ระบุหน่วยงาน";
        const schoolName =
            userData.school ||
            userData.schoolName ||
            userData.school_name ||
            result.school ||
            result.schoolName ||
            result.school_name ||
            "";

        if (!userCode) {
            throw new Error("ไม่พบรหัสผู้ใช้งานจากระบบ");
        }

        localStorage.setItem("userCode", String(userCode));
        localStorage.setItem("name", String(name));
        localStorage.setItem("role", String(role));
        localStorage.setItem("areaService", String(areaService));
        localStorage.setItem("school", String(schoolName || areaService));
        const loginAt = Date.now();
        localStorage.setItem("loginAt", String(loginAt));
        localStorage.setItem("expiresAt", String(loginAt + SESSION_TIMEOUT_MS));

        alertBox.textContent = result.message || "เข้าสู่ระบบสำเร็จ";
        alertBox.classList.add("success");

        window.location.href = "dashboard.html";
    } catch (error) {
        if (error && error.name === "AbortError") {
            alertBox.textContent = "การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง";
        } else {
            alertBox.textContent = error.message || "ไม่สามารถเชื่อมต่อระบบได้";
        }
        alertBox.classList.add("error");
    } finally {
        clearTimeout(timeoutId);
        loginBtn.disabled = false;
        loginBtn.textContent = "เข้าสู่ระบบ";
    }
}

function showStoredAuthMessage() {
    const alertBox = document.getElementById("alert-box");
    if (!alertBox || typeof sessionStorage === "undefined") {
        return;
    }

    const authMessage = sessionStorage.getItem("authMessage");
    if (!authMessage) {
        return;
    }

    alertBox.textContent = authMessage;
    alertBox.className = "text-sm min-h-5";
    alertBox.classList.add("error");
    sessionStorage.removeItem("authMessage");
}

function setCredentialMessage(message, type) {
    const messageBox = document.getElementById("credential-modal-message");
    if (!messageBox) {
        return;
    }

    messageBox.textContent = message || "";
    messageBox.className = "credential-modal__message text-sm";

    if (type === "error") {
        messageBox.classList.add("text-red-700");
    } else if (type === "success") {
        messageBox.classList.add("text-emerald-700");
    } else {
        messageBox.classList.add("text-slate-600");
    }
}

function renderCredentialResults(items, showEmptyState) {
    const resultsContainer = document.getElementById("credential-results");
    if (!resultsContainer) {
        return;
    }

    resultsContainer.innerHTML = "";

    if (!Array.isArray(items) || items.length === 0) {
        if (!showEmptyState) {
            return;
        }
        const empty = document.createElement("div");
        empty.className = "credential-result-card";
        empty.textContent = "ไม่พบข้อมูลโรงเรียนที่ค้นหา";
        resultsContainer.appendChild(empty);
        return;
    }

    for (let i = 0; i < items.length; i += 1) {
        const item = items[i] || {};
        const card = document.createElement("div");
        card.className = "credential-result-card";

        const grid = document.createElement("div");
        grid.className = "credential-result-card__grid";

        const fields = [
            ["รหัสประจำตัว", item.userCode || "-"],
            ["โรงเรียน", item.schoolName || "-"],
            ["สังกัด", item.areaService || "-"],
            ["อีเมล", item.email || "-"],
            ["รหัสผ่าน", item.password || "ไม่สามารถแสดงรหัสผ่านเดิมได้ กรุณาติดต่อผู้ดูแลระบบ"]
        ];

        for (let j = 0; j < fields.length; j += 1) {
            const row = document.createElement("p");
            const label = document.createElement("span");
            label.className = "credential-result-card__label";
            label.textContent = fields[j][0] + ": ";
            row.appendChild(label);
            row.appendChild(document.createTextNode(fields[j][1]));
            grid.appendChild(row);
        }

        const actionBtn = document.createElement("button");
        actionBtn.type = "button";
        actionBtn.className = "credential-result-card__action";
        actionBtn.textContent = "นำรหัสไปใช้เข้าสู่ระบบ";
        actionBtn.dataset.userCode = item.userCode || "";
        actionBtn.dataset.password = item.password || "";

        actionBtn.addEventListener("click", function () {
            const usernameInput = document.getElementById("username");
            const passwordInput = document.getElementById("password");
            if (usernameInput) {
                usernameInput.value = actionBtn.dataset.userCode || "";
            }
            if (passwordInput && actionBtn.dataset.password) {
                passwordInput.value = actionBtn.dataset.password;
            }
            closeCredentialModal();
        });

        card.appendChild(grid);
        card.appendChild(actionBtn);
        resultsContainer.appendChild(card);
    }
}

function openCredentialModal() {
    const modal = document.getElementById("credential-modal");
    const keywordInput = document.getElementById("credential-keyword");
    if (!modal) {
        return;
    }

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    setCredentialMessage("", "info");
    renderCredentialResults([], false);

    if (keywordInput) {
        keywordInput.value = "";
        keywordInput.focus();
    }
}

function closeCredentialModal() {
    const modal = document.getElementById("credential-modal");
    if (!modal) {
        return;
    }

    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
}

async function searchSchoolCredential() {
    const keywordInput = document.getElementById("credential-keyword");
    const searchBtn = document.getElementById("credential-search-btn");
    const alertBox = document.getElementById("alert-box");

    const keyword = keywordInput ? keywordInput.value.trim() : "";
    if (!keyword) {
        setCredentialMessage("กรุณากรอกคำค้นหา", "error");
        renderCredentialResults([], true);
        return;
    }

    if (searchBtn) {
        searchBtn.disabled = true;
        searchBtn.textContent = "กำลังค้นหา...";
    }
    setCredentialMessage("กำลังค้นหาข้อมูล...", "info");

    const controller = new AbortController();
    const timeoutId = setTimeout(function () {
        controller.abort();
    }, SEARCH_REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(GAS_API_URL, {
            method: "POST",
            body: JSON.stringify({
                action: "searchSchoolCredential",
                keyword: keyword
            }),
            signal: controller.signal
        });

        const rawText = await response.text();
        let result;
        try {
            result = JSON.parse(rawText);
        } catch {
            throw new Error("รูปแบบข้อมูลตอบกลับไม่ถูกต้อง");
        }

        if (!response.ok || result.success === false) {
            throw new Error(result.message || "ไม่สามารถค้นหาข้อมูลได้");
        }

        const rows = Array.isArray(result.data) ? result.data : [];
        renderCredentialResults(rows, true);

        if (rows.length === 0) {
            setCredentialMessage("ไม่พบข้อมูลโรงเรียนที่ค้นหา", "info");
        } else if (result.message) {
            setCredentialMessage(result.message, "error");
        } else {
            setCredentialMessage("พบข้อมูล " + rows.length + " รายการ", "success");
        }
    } catch (error) {
        const message = error && error.name === "AbortError"
            ? "การค้นหาใช้เวลานานเกินไป กรุณาลองใหม่"
            : (error.message || "ไม่สามารถเชื่อมต่อระบบได้");

        setCredentialMessage(message, "error");
        renderCredentialResults([], true);

        if (alertBox) {
            alertBox.textContent = message;
            alertBox.className = "text-sm min-h-5 error";
        }
    } finally {
        clearTimeout(timeoutId);
        if (searchBtn) {
            searchBtn.disabled = false;
            searchBtn.textContent = "ค้นหา";
        }
    }
}

function setupCredentialSearch() {
    const triggerBtn = document.getElementById("search-credential-btn");
    const searchBtn = document.getElementById("credential-search-btn");
    const keywordInput = document.getElementById("credential-keyword");
    const closeElements = document.querySelectorAll("[data-close-credential-modal]");

    if (!triggerBtn) {
        return;
    }

    triggerBtn.addEventListener("click", openCredentialModal);

    if (searchBtn) {
        searchBtn.addEventListener("click", searchSchoolCredential);
    }

    if (keywordInput) {
        keywordInput.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                searchSchoolCredential();
            }
        });
    }

    for (let i = 0; i < closeElements.length; i += 1) {
        closeElements[i].addEventListener("click", closeCredentialModal);
    }

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            closeCredentialModal();
        }
    });
}

showStoredAuthMessage();
setupCredentialSearch();

document.getElementById("login-form").addEventListener("submit", login);
