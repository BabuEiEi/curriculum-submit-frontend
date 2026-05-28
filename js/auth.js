const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000;

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
        alertBox.textContent = error.message || "ไม่สามารถเชื่อมต่อระบบได้";
        alertBox.classList.add("error");
    } finally {
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

showStoredAuthMessage();

document.getElementById("login-form").addEventListener("submit", login);
