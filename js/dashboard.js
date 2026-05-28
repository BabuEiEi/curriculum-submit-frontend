const ROLE_LABELS = {
  admin: "Admin",
  staff: "Staff",
  school: "School",
};

const MENU_BY_ROLE = {
  admin: [
    { label: "Dashboard", page: "dashboard" },
    { label: "จัดการผู้ใช้งาน", page: "users" },
    { label: "Import CSV", page: "import" },
    { label: "รายชื่อโรงเรียน", page: "schools" },
    { label: "สถานะการส่งงาน", page: "submissions" },
  ],
  staff: [
    { label: "Dashboard", page: "dashboard" },
    { label: "รายชื่อโรงเรียน", page: "schools" },
    { label: "สถานะการส่งงาน", page: "submissions" },
  ],
  school: [
    { label: "ข้อมูลโรงเรียน", page: "school-info" },
    { label: "ส่งงานหลักสูตร", page: "curriculum-submit" },
    { label: "สถานะการส่งงาน", page: "submissions" },
  ],
};

let currentUser = null;
let currentPage = "dashboard";
const USERS_API_URL =
  (typeof window !== "undefined" && window.GAS_API_URL) ||
  (typeof GAS_API_URL !== "undefined" ? GAS_API_URL : "https://script.google.com/macros/s/AKfycbw3xhPyGbzTvSY_zp3SUo3HjBIWvEj0bCaQ3bbyD4EPk5X7f9Ge7jOEFnJyCQirESxggg/exec");

let usersState = [];
let usersLoading = false;
let usersErrorMessage = "";
let usersFeedbackMessage = "";
let schoolsState = [];
let schoolsLoading = false;
let schoolsErrorMessage = "";
let submissionStatusState = [];
let submissionStatusLoading = false;
let submissionStatusErrorMessage = "";
let submissionDetailLoading = false;
let submissionDetailErrorMessage = "";
let submissionDetailData = null;
let curriculumUploadLoading = false;
let curriculumUploadMessage = "";
let curriculumUploadMessageType = "";
let importCsvRows = [];
let importCsvFileName = "";
let importCsvMessage = "";
let importCsvMessageType = "";
let importCsvLoading = false;
let dashboardStatsLoading = false;
let dashboardStatsErrorMessage = "";
let dashboardStatsData = null;
let dashboardStatsLastUpdated = null;
let dashboardStatsIntervalId = null;
let schoolProfileLoading = false;
let schoolProfileSaving = false;
let schoolProfileErrorMessage = "";
let schoolProfileData = null;

let usersCurrentPage = 1;
let schoolsCurrentPage = 1;
let submissionStatusCurrentPage = 1;

const MAX_UPLOAD_FILE_SIZE = 5 * 1024 * 1024;
const TABLE_PAGE_SIZE = 20;
const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000;

let sessionValidationReason = "";

const IMPORT_CSV_HEADERS = [
  "userCode",
  "name",
  "schoolName",
  "areaService",
  "email",
  "password",
  "role",
  "isActive",
];

const PAGE_PERMISSIONS = {
  admin: ["dashboard", "users", "import", "schools", "submissions"],
  staff: ["dashboard", "schools", "submissions"],
  school: ["school-info", "curriculum-submit", "submissions"],
};

function normalizeRole(roleValue) {
  const normalized = String(roleValue || "").trim().toLowerCase();
  return ["admin", "staff", "school"].includes(normalized) ? normalized : null;
}

function getDefaultPageForRole(role) {
  if (role === "school") {
    return "school-info";
  }
  return "dashboard";
}

function canAccessPage(page, user) {
  if (!user || !page) {
    return false;
  }
  const role = normalizeRole(user.role);
  if (!role) {
    return false;
  }
  const allowed = PAGE_PERMISSIONS[role] || [];
  return allowed.includes(page);
}

function renderForbiddenPage() {
  const pageContent = document.getElementById("page-content");
  if (!pageContent) {
    return;
  }
  showWarning("คุณไม่มีสิทธิ์เข้าถึงหน้านี้", "ไม่มีสิทธิ์เข้าถึง");
  pageContent.innerHTML = renderCard(
    "ไม่มีสิทธิ์เข้าถึง",
    '<p class="text-rose-600">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</p>'
  );
}

function getSwalOptionsBase(title, message, icon) {
  return {
    title,
    text: message,
    icon,
    confirmButtonColor: "#0f172a",
    cancelButtonColor: "#64748b",
    denyButtonColor: "#e11d48",
  };
}

async function showSuccess(message, title = "สำเร็จ") {
  return Swal.fire({
    ...getSwalOptionsBase(title, message, "success"),
    confirmButtonText: "ตกลง",
  });
}

async function showError(message, title = "เกิดข้อผิดพลาด") {
  return Swal.fire({
    ...getSwalOptionsBase(title, message, "error"),
    confirmButtonText: "ตกลง",
  });
}

async function showWarning(message, title = "แจ้งเตือน") {
  return Swal.fire({
    ...getSwalOptionsBase(title, message, "warning"),
    confirmButtonText: "ตกลง",
  });
}

async function showConfirm(message, title = "ยืนยันการดำเนินการ") {
  const result = await Swal.fire({
    ...getSwalOptionsBase(title, message, "warning"),
    showCancelButton: true,
    confirmButtonText: "ยืนยัน",
    cancelButtonText: "ยกเลิก",
    reverseButtons: true,
  });

  return result.isConfirmed;
}

function showLoading(message = "กำลังดำเนินการ...") {
  Swal.fire({
    title: message,
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => {
      Swal.showLoading();
    },
  });
}

function closeLoading() {
  Swal.close();
}

function toBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  return Boolean(value);
}

function normalizeUser(row) {
  const current = row || {};
  return {
    id: current.id,
    userCode: current.userCode || current.user_code || "",
    name: current.name || "",
    schoolName: current.schoolName || current.school_name || "",
    areaService: current.areaService || current.area_service || "",
    email: current.email || "",
    role: current.role || "",
    isActive: typeof current.isActive === "boolean" ? current.isActive : toBoolean(current.is_active),
    createdAt: current.createdAt || current.created_at || "",
    updatedAt: current.updatedAt || current.updated_at || "",
  };
}

function normalizeSchool(row) {
  const current = row || {};
  return {
    id: current.id,
    userCode: current.userCode || current.user_code || "",
    name: current.name || "",
    schoolName: current.schoolName || current.school_name || current.name || "",
    areaService: current.areaService || current.area_service || "",
    email: current.email || "",
    role: current.role || "",
    isActive: typeof current.isActive === "boolean" ? current.isActive : toBoolean(current.is_active),
  };
}

function normalizeSubmission(row) {
  const current = row || {};
  const submittedAt = current.submittedAt || current.submitted_at || null;
  const updatedAt = current.updatedAt || current.updated_at || null;

  return {
    userCode: current.userCode || current.user_code || "",
    schoolName: current.schoolName || current.school_name || "",
    areaService: current.areaService || current.area_service || "",
    earlyFile: current.earlyFile || current.early_file || null,
    lowerFile: current.lowerFile || current.lower_file || null,
    upperFile: current.upperFile || current.upper_file || null,
    earlyStatus: current.earlyStatus || current.early_status || "ยังไม่ส่ง",
    lowerStatus: current.lowerStatus || current.lower_status || "ยังไม่ส่ง",
    upperStatus: current.upperStatus || current.upper_status || "ยังไม่ส่ง",
    overallStatus: current.overallStatus || current.overall_status || computeOverallSubmissionStatus(current),
    submittedAt,
    updatedAt,
    latestSubmittedAt: updatedAt || submittedAt || null,
  };
}

function normalizeSubmissionDetail(row) {
  const current = row || {};
  const normalized = normalizeSubmission(current);

  return {
    ...normalized,
    uploadedAt: current.uploadedAt || normalized.submittedAt || null,
    earlyFileUrl: current.earlyFileUrl || normalized.earlyFile || null,
    lowerFileUrl: current.lowerFileUrl || normalized.lowerFile || null,
    upperFileUrl: current.upperFileUrl || normalized.upperFile || null,
    earlyFileName: current.earlyFileName || "",
    lowerFileName: current.lowerFileName || "",
    upperFileName: current.upperFileName || "",
  };
}

function normalizeSchoolProfile(row) {
  const current = row || {};

  return {
    userCode: current.userCode || current.user_code || "",
    schoolName: current.schoolName || current.school_name || current.name || "",
    address: current.address || "",
    contactName: current.contactName || current.contact_name || "",
    phone: current.phone || "",
    areaService: current.areaService || current.area_service || "",
    email: current.email || "",
    source: current.source || "schools",
  };
}

function paginateData(data, currentPage, pageSize) {
  const rows = Array.isArray(data) ? data : [];
  const safePageSize = Math.max(1, Number(pageSize) || TABLE_PAGE_SIZE);
  const totalItems = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const safeCurrentPage = Math.min(Math.max(1, Number(currentPage) || 1), totalPages);
  const startIndex = (safeCurrentPage - 1) * safePageSize;

  return {
    items: rows.slice(startIndex, startIndex + safePageSize),
    totalItems,
    totalPages,
    currentPage: safeCurrentPage,
    pageSize: safePageSize,
  };
}

function renderPaginationControls(options) {
  const totalItems = Number(options && options.totalItems) || 0;
  const totalPages = Math.max(1, Number(options && options.totalPages) || 1);
  const currentPage = Math.min(Math.max(1, Number(options && options.currentPage) || 1), totalPages);

  if (totalItems === 0) {
    return "";
  }

  const pageButtons = [];
  for (let page = 1; page <= totalPages; page += 1) {
    pageButtons.push(`
      <button
        type="button"
        data-page-target="${page}"
        class="min-w-10 rounded-lg border px-3 py-2 text-sm transition-colors ${page === currentPage ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"}"
      >
        ${page}
      </button>
    `);
  }

  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;

  return `
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <p class="text-sm text-slate-600">หน้า ${currentPage} จาก ${totalPages}</p>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-page-action="prev"
          class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          ${prevDisabled ? "disabled" : ""}
        >
          ก่อนหน้า
        </button>
        ${pageButtons.join("")}
        <button
          type="button"
          data-page-action="next"
          class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          ${nextDisabled ? "disabled" : ""}
        >
          ถัดไป
        </button>
      </div>
    </div>
  `;
}

function getSessionExpiry() {
  const expiresAtRaw = localStorage.getItem("expiresAt");
  if (!expiresAtRaw) {
    return null;
  }

  const expiresAtMs = Number(expiresAtRaw);
  if (Number.isFinite(expiresAtMs) && expiresAtMs > 0) {
    return expiresAtMs;
  }

  const parsedDate = Date.parse(expiresAtRaw);
  if (Number.isFinite(parsedDate) && parsedDate > 0) {
    return parsedDate;
  }

  return null;
}

function isSessionExpired() {
  const expiryMs = getSessionExpiry();
  if (!expiryMs) {
    return true;
  }

  return Date.now() >= expiryMs;
}

function clearSession() {
  localStorage.removeItem("userCode");
  localStorage.removeItem("schoolCode");
  localStorage.removeItem("name");
  localStorage.removeItem("role");
  localStorage.removeItem("areaService");
  localStorage.removeItem("school");
  localStorage.removeItem("loginAt");
  localStorage.removeItem("expiresAt");
}

function redirectToLogin(reason) {
  if (reason === "expired" && typeof sessionStorage !== "undefined") {
    sessionStorage.setItem("authMessage", "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่");
  }
  window.location.href = "index.html";
}

function ensureSessionActive() {
  if (isSessionExpired()) {
    clearSession();
    sessionValidationReason = "expired";
    redirectToLogin("expired");
    return false;
  }

  return true;
}

function getSessionUser() {
  sessionValidationReason = "";

  const userCode = localStorage.getItem("userCode");
  const schoolCode = localStorage.getItem("schoolCode") || localStorage.getItem("userCode");
  const name = localStorage.getItem("name");
  const roleRaw = localStorage.getItem("role");
  const areaService = localStorage.getItem("areaService") || localStorage.getItem("school");
  const school = localStorage.getItem("school");
  const expiresAtRaw = localStorage.getItem("expiresAt");

  if (!userCode || !roleRaw) {
    sessionValidationReason = "missing";
    return null;
  }

  if (!expiresAtRaw) {
    sessionValidationReason = "missing";
    clearSession();
    return null;
  }

  if (isSessionExpired()) {
    sessionValidationReason = "expired";
    clearSession();
    return null;
  }

  if (!name || !areaService) {
    sessionValidationReason = "missing";
    return null;
  }

  const role = normalizeRole(roleRaw);
  if (!MENU_BY_ROLE[role]) {
    sessionValidationReason = "missing";
    return null;
  }

  return { userCode, schoolCode, name, role, areaService, school };
}

function buildRequesterPayload() {
  if (!ensureSessionActive()) {
    return {};
  }

  if (!currentUser) {
    return {};
  }

  return {
    requesterUserCode: String(currentUser.schoolCode || currentUser.userCode || "").trim(),
    requesterRole: String(currentUser.role || "").trim().toLowerCase(),
  };
}

function createMenuItem(item) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "menu-item w-full text-left rounded-lg px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-800 transition-colors flex items-center";
  button.dataset.page = item.page;

  const icon = document.createElement("span");
  icon.className = "icon mr-2";
  icon.textContent = "•";

  const label = document.createElement("span");
  label.className = "label";
  label.textContent = item.label;

  button.appendChild(icon);
  button.appendChild(label);

  button.addEventListener("click", () => {
    navigateToPage(item.page);
  });

  return button;
}

function renderMenu(role) {
  const menuList = document.getElementById("menu-list");
  menuList.innerHTML = "";

  const items = MENU_BY_ROLE[role] || [];
  items.forEach((item) => {
    menuList.appendChild(createMenuItem(item));
  });

  currentPage = getDefaultPageForRole(role);
}

function renderCard(title, bodyHtml) {
  return `
    <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-slate-900">${title}</h2>
      <div class="text-slate-600 mt-2">${bodyHtml}</div>
    </div>
  `;
}

function renderSchoolProfilePage() {
  const pageContent = document.getElementById("page-content");
  if (!pageContent || !currentUser) {
    return;
  }

  const profile = schoolProfileData || normalizeSchoolProfile({
    userCode: currentUser.userCode,
    schoolName: currentUser.school || currentUser.name || "",
    areaService: currentUser.areaService || "",
    email: "",
    source: "users_fallback",
  });
  const disabledClass = "bg-slate-100 text-slate-500 cursor-not-allowed";
  const fallbackNote = profile.source === "users_fallback"
    ? '<p class="mt-3 text-sm text-amber-700">ข้อมูลเริ่มต้นจากบัญชีผู้ใช้ กรุณาตรวจสอบและบันทึกข้อมูลโรงเรียน</p>'
    : "";
  const errorMessage = schoolProfileErrorMessage
    ? `<p class="mt-3 text-sm font-medium text-rose-600">${escapeHtml(schoolProfileErrorMessage)}</p>`
    : "";

  if (schoolProfileLoading) {
    pageContent.innerHTML = renderCard("ข้อมูลโรงเรียน", '<p class="text-sm text-slate-500">กำลังโหลดข้อมูลโรงเรียน...</p>');
    return;
  }

  pageContent.innerHTML = renderCard(
    "ข้อมูลโรงเรียน",
    `
      ${fallbackNote}
      ${errorMessage}
      <form id="school-profile-form" class="mt-4 space-y-5">
        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <label for="school-profile-user-code" class="block text-sm text-slate-700 mb-1">รหัสโรงเรียน</label>
            <input id="school-profile-user-code" type="text" value="${escapeHtml(profile.userCode)}" readonly class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm ${disabledClass}" />
          </div>
          <div>
            <label for="school-profile-school-name" class="block text-sm text-slate-700 mb-1">ชื่อโรงเรียน</label>
            <input id="school-profile-school-name" type="text" value="${escapeHtml(profile.schoolName)}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400" />
          </div>
          <div>
            <label for="school-profile-area-service" class="block text-sm text-slate-700 mb-1">สังกัด</label>
            <input id="school-profile-area-service" type="text" value="${escapeHtml(profile.areaService)}" disabled class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm ${disabledClass}" />
          </div>
          <div>
            <label for="school-profile-email" class="block text-sm text-slate-700 mb-1">อีเมล</label>
            <input id="school-profile-email" type="email" value="${escapeHtml(profile.email)}" readonly class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm ${disabledClass}" />
          </div>
        </div>
        <div>
          <label for="school-profile-address" class="block text-sm text-slate-700 mb-1">ที่อยู่</label>
          <textarea id="school-profile-address" rows="4" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400">${escapeHtml(profile.address)}</textarea>
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <label for="school-profile-contact-name" class="block text-sm text-slate-700 mb-1">ชื่อผู้รับผิดชอบ</label>
            <input id="school-profile-contact-name" type="text" value="${escapeHtml(profile.contactName)}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400" />
          </div>
          <div>
            <label for="school-profile-phone" class="block text-sm text-slate-700 mb-1">เบอร์โทรติดต่อ</label>
            <input id="school-profile-phone" type="text" value="${escapeHtml(profile.phone)}" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400" />
          </div>
        </div>
        <div class="flex justify-end">
          <button id="school-profile-save-btn" type="submit" class="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed" ${schoolProfileSaving ? "disabled" : ""}>
            ${schoolProfileSaving ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
          </button>
        </div>
      </form>
    `
  );

  bindSchoolProfileEvents();
}

async function fetchSchoolProfile() {
  if (!currentUser || normalizeRole(currentUser.role) !== "school") {
    console.warn("Access denied: fetchSchoolProfile");
    return;
  }

  schoolProfileLoading = true;
  schoolProfileErrorMessage = "";
  renderSchoolProfilePage();

  try {
    const response = await fetch(USERS_API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "getSchoolProfile",
        ...buildRequesterPayload(),
      }),
    });

    const rawText = await response.text();
    let result;

    try {
      result = JSON.parse(rawText);
    } catch {
      throw new Error("รูปแบบข้อมูลตอบกลับไม่ถูกต้อง");
    }

    if (!response.ok) {
      throw new Error((result && result.message) || "ไม่สามารถโหลดข้อมูลโรงเรียนได้");
    }

    if (result && result.success === false) {
      throw new Error(result.message || "ไม่สามารถโหลดข้อมูลโรงเรียนได้");
    }

    schoolProfileData = normalizeSchoolProfile(result && result.data ? result.data : null);
  } catch (error) {
    schoolProfileData = null;
    const isNetworkError = error instanceof TypeError;
    schoolProfileErrorMessage = isNetworkError
      ? "ไม่สามารถเชื่อมต่อระบบได้ กรุณาตรวจสอบอินเทอร์เน็ตหรือเซิร์ฟเวอร์"
      : (error.message || "ไม่สามารถโหลดข้อมูลโรงเรียนได้");
    await showError(schoolProfileErrorMessage);
  } finally {
    schoolProfileLoading = false;
    if (currentPage === "school-info") {
      renderSchoolProfilePage();
    }
  }
}

function validateSchoolProfileForm(values) {
  const schoolName = String((values && values.schoolName) || "").trim();
  const phone = String((values && values.phone) || "").trim();
  const phonePattern = /^[0-9+\-\s]*$/;

  if (!schoolName) {
    return "กรุณาระบุชื่อโรงเรียน";
  }

  if (phone && !phonePattern.test(phone)) {
    return "รูปแบบเบอร์โทรไม่ถูกต้อง";
  }

  return "";
}

async function submitSchoolProfileForm(event) {
  event.preventDefault();

  if (!currentUser || normalizeRole(currentUser.role) !== "school" || schoolProfileSaving) {
    return;
  }

  const profile = schoolProfileData || normalizeSchoolProfile({
    userCode: currentUser.userCode,
    schoolName: currentUser.school || currentUser.name || "",
    areaService: currentUser.areaService || "",
    email: "",
  });
  const values = {
    userCode: profile.userCode || currentUser.userCode,
    schoolName: document.getElementById("school-profile-school-name")?.value || "",
    address: document.getElementById("school-profile-address")?.value || "",
    contactName: document.getElementById("school-profile-contact-name")?.value || "",
    phone: document.getElementById("school-profile-phone")?.value || "",
    areaService: profile.areaService || currentUser.areaService || "",
    email: profile.email || "",
  };

  const validationMessage = validateSchoolProfileForm(values);
  if (validationMessage) {
    schoolProfileErrorMessage = validationMessage;
    renderSchoolProfilePage();
    await showError(validationMessage);
    return;
  }

  schoolProfileSaving = true;
  schoolProfileErrorMessage = "";
  renderSchoolProfilePage();
  showLoading("กำลังบันทึกข้อมูลโรงเรียน...");

  try {
    const response = await fetch(USERS_API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "updateSchoolProfile",
        ...values,
        ...buildRequesterPayload(),
      }),
    });

    const rawText = await response.text();
    let result;

    try {
      result = JSON.parse(rawText);
    } catch {
      throw new Error("รูปแบบข้อมูลตอบกลับไม่ถูกต้อง");
    }

    if (!response.ok) {
      throw new Error((result && result.message) || "ไม่สามารถบันทึกข้อมูลโรงเรียนได้");
    }

    if (result && result.success === false) {
      throw new Error(result.message || "ไม่สามารถบันทึกข้อมูลโรงเรียนได้");
    }

    schoolProfileData = normalizeSchoolProfile(result && result.data ? result.data : values);

    if (currentUser && schoolProfileData.schoolName && schoolProfileData.schoolName !== currentUser.school) {
      currentUser.school = schoolProfileData.schoolName;
      localStorage.setItem("school", schoolProfileData.schoolName);
    }

    fillProfile(currentUser);
    await showSuccess((result && result.message) || "บันทึกข้อมูลโรงเรียนสำเร็จ");
    await fetchSchoolProfile();
  } catch (error) {
    const isNetworkError = error instanceof TypeError;
    schoolProfileErrorMessage = isNetworkError
      ? "ไม่สามารถเชื่อมต่อระบบได้ กรุณาตรวจสอบอินเทอร์เน็ตหรือเซิร์ฟเวอร์"
      : (error.message || "ไม่สามารถบันทึกข้อมูลโรงเรียนได้");
    renderSchoolProfilePage();
    await showError(schoolProfileErrorMessage);
  } finally {
    schoolProfileSaving = false;
    closeLoading();
    if (currentPage === "school-info") {
      renderSchoolProfilePage();
    }
  }
}

function bindSchoolProfileEvents() {
  const form = document.getElementById("school-profile-form");
  if (form) {
    form.addEventListener("submit", submitSchoolProfileForm);
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getRoleDisplayName(role) {
  return ROLE_LABELS[role] || role;
}

function getStatusDisplayName(status) {
  if (typeof status === "boolean") {
    return status ? "ใช้งาน" : "ปิดใช้งาน";
  }

  return status === "active" ? "ใช้งาน" : "ปิดใช้งาน";
}

function resetImportCsvState() {
  importCsvRows = [];
  importCsvFileName = "";
  importCsvMessage = "";
  importCsvMessageType = "";
  importCsvLoading = false;
}

function normalizeCsvHeaderValue(value) {
  return String(value || "").replace(/^\uFEFF/, "").trim();
}

function parseCsvBoolean(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["true", "1", "yes", "y", "active", "ใช้งาน"].includes(normalized);
}

function parseCsvTextToRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index++) {
    const currentChar = text[index];
    const nextChar = text[index + 1];

    if (currentChar === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        index++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && currentChar === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && currentChar === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    if (!inQuotes && currentChar === "\r") {
      continue;
    }

    cell += currentChar;
  }

  row.push(cell);
  rows.push(row);

  return rows.filter((currentRow) => currentRow.some((value) => String(value || "").trim() !== ""));
}

function buildImportUsersFromRows(rows) {
  const headerRow = rows[0] || [];
  const normalizedHeaders = headerRow.map(normalizeCsvHeaderValue);

  if (normalizedHeaders.length !== IMPORT_CSV_HEADERS.length) {
    return {
      success: false,
      message: "header ไม่ครบ",
    };
  }

  for (let index = 0; index < IMPORT_CSV_HEADERS.length; index++) {
    if (normalizedHeaders[index] !== IMPORT_CSV_HEADERS[index]) {
      return {
        success: false,
        message: "header ไม่ถูกต้อง",
      };
    }
  }

  const users = rows.slice(1).map((row) => {
    const values = [...row];
    while (values.length < IMPORT_CSV_HEADERS.length) {
      values.push("");
    }

    return {
      userCode: String(values[0] || "").trim(),
      name: String(values[1] || "").trim(),
      schoolName: String(values[2] || "").trim(),
      areaService: String(values[3] || "").trim(),
      email: String(values[4] || "").trim(),
      password: String(values[5] || "").trim(),
      role: String(values[6] || "").trim(),
      isActive: parseCsvBoolean(values[7]),
    };
  });

  return {
    success: true,
    users,
  };
}

function renderImportCsvMessage() {
  if (!importCsvMessage) {
    return "";
  }

  const className =
    importCsvMessageType === "success"
      ? "text-emerald-700"
      : importCsvMessageType === "error"
        ? "text-rose-600"
        : "text-sky-700";

  return `<p class="text-sm font-medium ${className}">${escapeHtml(importCsvMessage)}</p>`;
}

function renderImportCsvPreviewTable() {
  if (!importCsvRows.length) {
    return `
      <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        เลือกไฟล์ CSV เพื่อดูตัวอย่างข้อมูลก่อนนำเข้า
      </div>
    `;
  }

  return `
    <div class="overflow-x-auto rounded-xl border border-slate-200">
      <table class="min-w-full bg-white">
        <thead class="bg-slate-50">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">userCode</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">name</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">schoolName</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">areaService</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">email</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">password</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">role</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">isActive</th>
          </tr>
        </thead>
        <tbody>
          ${importCsvRows
      .map(
        (user) => `
                <tr class="border-t border-slate-200">
                  <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(user.userCode)}</td>
                  <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(user.name)}</td>
                  <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(user.schoolName)}</td>
                  <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(user.areaService)}</td>
                  <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(user.email)}</td>
                  <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(user.password)}</td>
                  <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(user.role)}</td>
                  <td class="px-4 py-3 text-sm text-slate-700">${user.isActive ? "ใช้งาน" : "ปิดใช้งาน"}</td>
                </tr>
              `
      )
      .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderImportCsvPage() {
  const pageContent = document.getElementById("page-content");
  if (!pageContent) {
    return;
  }

  const importButtonLabel = importCsvLoading ? "กำลังนำเข้า..." : "Import";
  const importButtonDisabled = importCsvLoading || importCsvRows.length === 0;

  pageContent.innerHTML = `
    <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
      <div class="flex flex-col gap-2">
        <h2 class="text-lg font-semibold text-slate-900">Import CSV</h2>
        <p class="text-sm text-slate-600">อัปโหลดไฟล์ CSV เพื่อนำเข้าผู้ใช้งานไปยังระบบจริง</p>
      </div>

      <div class="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <label for="import-csv-input" class="block text-sm font-medium text-slate-700 mb-1">เลือกไฟล์ CSV</label>
          <input
            id="import-csv-input"
            type="file"
            accept=".csv"
            class="block w-full text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-800 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-900"
          />
          <p class="mt-2 text-xs text-slate-500">รองรับหัวตาราง: ${IMPORT_CSV_HEADERS.join(", ")}</p>
        </div>

        <button
          id="import-csv-btn"
          type="button"
          class="rounded-lg bg-slate-800 text-white px-4 py-2.5 text-sm font-medium hover:bg-slate-900 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          ${importButtonDisabled ? "disabled" : ""}
        >
          ${importButtonLabel}
        </button>
      </div>

      <div id="import-csv-status" class="space-y-2 min-h-5">
        ${renderImportCsvMessage()}
      </div>

      <div class="space-y-3">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <h3 class="text-base font-semibold text-slate-900">Preview ตาราง</h3>
          <div class="text-sm text-slate-600">
            ${importCsvFileName ? `ไฟล์: <span class="font-medium text-slate-800">${escapeHtml(importCsvFileName)}</span>` : "ยังไม่ได้เลือกไฟล์"}
          </div>
        </div>

        ${renderImportCsvPreviewTable()}
      </div>
    </div>
  `;

  bindImportCsvEvents();
}

function handleImportCsvFileChange(event) {
  const file = event.target.files && event.target.files[0];
  const input = event.target;

  importCsvMessage = "";
  importCsvMessageType = "";

  if (!file) {
    resetImportCsvState();
    renderImportCsvPage();
    return;
  }

  importCsvFileName = file.name;

  if (file.size === 0) {
    resetImportCsvState();
    importCsvFileName = file.name;
    importCsvMessage = "ไฟล์ว่าง";
    importCsvMessageType = "error";
    renderImportCsvPage();
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    const text = String(reader.result || "");

    if (!String(text).trim()) {
      resetImportCsvState();
      importCsvFileName = file.name;
      importCsvMessage = "ไฟล์ว่าง";
      importCsvMessageType = "error";
      renderImportCsvPage();
      return;
    }

    const rows = parseCsvTextToRows(text);

    if (rows.length === 0) {
      resetImportCsvState();
      importCsvFileName = file.name;
      importCsvMessage = "ไฟล์ว่าง";
      importCsvMessageType = "error";
      renderImportCsvPage();
      return;
    }

    const built = buildImportUsersFromRows(rows);
    if (!built.success) {
      resetImportCsvState();
      importCsvFileName = file.name;
      importCsvMessage = built.message;
      importCsvMessageType = "error";
      renderImportCsvPage();
      return;
    }

    if (built.users.length === 0) {
      resetImportCsvState();
      importCsvFileName = file.name;
      importCsvMessage = "ไม่พบข้อมูลสำหรับนำเข้า";
      importCsvMessageType = "error";
      renderImportCsvPage();
      return;
    }

    importCsvRows = built.users;
    importCsvFileName = file.name;
    importCsvMessage = `อ่านไฟล์สำเร็จ พบข้อมูล ${built.users.length} รายการ`;
    importCsvMessageType = "success";
    renderImportCsvPage();
  };

  reader.onerror = () => {
    resetImportCsvState();
    importCsvFileName = file.name;
    importCsvMessage = "ไม่สามารถอ่านไฟล์ได้";
    importCsvMessageType = "error";
    renderImportCsvPage();
  };

  reader.readAsText(file, "UTF-8");
  input.value = "";
}

async function submitImportCsv() {
  if (!currentUser || normalizeRole(currentUser.role) !== "admin") {
    console.warn("Access denied: submitImportCsv");
    return;
  }
  const statusBox = document.getElementById("import-csv-status");
  const importButton = document.getElementById("import-csv-btn");

  if (!importCsvRows.length) {
    importCsvMessage = "ยังไม่มีข้อมูลสำหรับนำเข้า";
    importCsvMessageType = "error";
    renderImportCsvPage();
    return;
  }

  importCsvLoading = true;
  importCsvMessage = "กำลังนำเข้า...";
  importCsvMessageType = "info";
  if (statusBox) {
    statusBox.innerHTML = renderImportCsvMessage();
  }
  if (importButton) {
    importButton.disabled = true;
    importButton.textContent = "กำลังนำเข้า...";
  }

  try {
    showLoading("กำลังนำเข้าข้อมูล...");

    const response = await fetch(USERS_API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "importUsers",
        users: importCsvRows,
        ...buildRequesterPayload(),
      }),
    });

    const rawText = await response.text();
    let result;

    try {
      result = JSON.parse(rawText);
    } catch {
      throw new Error("รูปแบบข้อมูลตอบกลับไม่ถูกต้อง");
    }

    if (!response.ok) {
      throw new Error((result && result.message) || "ไม่สามารถนำเข้าข้อมูลได้");
    }

    if (result && result.success === false) {
      throw new Error(result.message || "ไม่สามารถนำเข้าข้อมูลได้");
    }

    const successMessage = (result && result.message) || "นำเข้าสำเร็จ";
    resetImportCsvState();
    importCsvMessage = successMessage;
    importCsvMessageType = "success";
    renderImportCsvPage();
    await showSuccess(successMessage);
  } catch (error) {
    importCsvMessage = error.message || "ไม่สามารถนำเข้าข้อมูลได้";
    importCsvMessageType = "error";
    importCsvLoading = false;
    renderImportCsvPage();
    await showError(error.message || "ไม่สามารถนำเข้าข้อมูลได้");
  } finally {
    closeLoading();
  }
}

function bindImportCsvEvents() {
  const fileInput = document.getElementById("import-csv-input");
  const importButton = document.getElementById("import-csv-btn");

  if (fileInput) {
    fileInput.addEventListener("change", handleImportCsvFileChange);
  }

  if (importButton) {
    importButton.addEventListener("click", submitImportCsv);
  }
}

async function fetchUsers() {
  if (!currentUser || normalizeRole(currentUser.role) !== "admin") {
    console.warn("Access denied: fetchUsers");
    return;
  }
  usersLoading = true;
  usersErrorMessage = "";
  renderUsersFeedback();
  renderUsersTableRows(document.getElementById("users-search-input")?.value || "");

  try {
    const response = await fetch(USERS_API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "getUsers",
        ...buildRequesterPayload(),
      }),
    });

    const rawText = await response.text();
    let result;

    try {
      result = JSON.parse(rawText);
    } catch {
      throw new Error("รูปแบบข้อมูลตอบกลับไม่ถูกต้อง");
    }

    console.log("getUsers response:", result);

    if (!response.ok) {
      throw new Error("ไม่สามารถโหลดข้อมูลผู้ใช้งานได้");
    }

    if (result && result.success === false) {
      throw new Error(result.message || "ไม่สามารถโหลดข้อมูลผู้ใช้งานได้");
    }

    const rows = Array.isArray(result)
      ? result
      : Array.isArray(result?.data)
        ? result.data
        : [];

    usersState = rows.map(normalizeUser);
  } catch (error) {
    usersState = [];
    usersErrorMessage = error.message || "เกิดข้อผิดพลาดในการโหลดข้อมูลผู้ใช้งาน";
  } finally {
    usersLoading = false;
    renderUsersTableRows(document.getElementById("users-search-input")?.value || "");
  }
}

async function fetchSchools() {
  schoolsLoading = true;
  schoolsErrorMessage = "";
  renderSchoolsTableRows(document.getElementById("schools-search-input")?.value || "");

  try {
    const response = await fetch(USERS_API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "getSchools",
        ...buildRequesterPayload(),
      }),
    });

    const rawText = await response.text();
    let result;

    try {
      result = JSON.parse(rawText);
    } catch {
      throw new Error("รูปแบบข้อมูลตอบกลับไม่ถูกต้อง");
    }

    if (!response.ok) {
      throw new Error((result && result.message) || "ไม่สามารถโหลดข้อมูลโรงเรียนได้");
    }

    if (result && result.success === false) {
      throw new Error(result.message || "ไม่สามารถโหลดข้อมูลโรงเรียนได้");
    }

    const rows = Array.isArray(result)
      ? result
      : Array.isArray(result && result.data)
        ? result.data
        : [];

    schoolsState = rows
      .map(normalizeSchool)
      .map((row) => {
        const role = normalizeRole(row.role || "school");
        if (role !== "school") {
          return null;
        }

        return row;
      })
      .filter(Boolean);
  } catch (error) {
    schoolsState = [];
    schoolsErrorMessage = error.message || "เกิดข้อผิดพลาดในการโหลดข้อมูลโรงเรียน";
  } finally {
    schoolsLoading = false;
    renderSchoolsTableRows(document.getElementById("schools-search-input")?.value || "");
  }
}

function renderSchoolsTableRows(searchText) {
  const tableBody = document.getElementById("schools-table-body");
  const paginationBody = document.getElementById("schools-pagination");
  if (!tableBody) {
    return;
  }

  if (schoolsLoading) {
    tableBody.innerHTML =
      '<tr><td colspan="6" class="px-4 py-6 text-center text-slate-500">กำลังโหลดข้อมูล...</td></tr>';
    if (paginationBody) {
      paginationBody.innerHTML = "";
    }
    return;
  }

  if (schoolsErrorMessage) {
    tableBody.innerHTML =
      `<tr><td colspan="6" class="px-4 py-6 text-center text-rose-600">${escapeHtml(schoolsErrorMessage)}</td></tr>`;
    if (paginationBody) {
      paginationBody.innerHTML = "";
    }
    return;
  }

  const keyword = String(searchText || "").trim().toLowerCase();
  const filteredSchools = schoolsState.filter((school) => {
    if (!keyword) {
      return true;
    }

    return (
      school.userCode.toLowerCase().includes(keyword) ||
      school.schoolName.toLowerCase().includes(keyword) ||
      school.areaService.toLowerCase().includes(keyword) ||
      school.email.toLowerCase().includes(keyword)
    );
  });

  if (filteredSchools.length === 0) {
    tableBody.innerHTML =
      '<tr><td colspan="6" class="px-4 py-6 text-center text-slate-500">ไม่พบข้อมูลโรงเรียน</td></tr>';
    if (paginationBody) {
      paginationBody.innerHTML = "";
    }
    return;
  }

  const pagination = paginateData(filteredSchools, schoolsCurrentPage, TABLE_PAGE_SIZE);
  schoolsCurrentPage = pagination.currentPage;

  tableBody.innerHTML = pagination.items
    .map((school) => {
      return `
        <tr class="border-t border-slate-200">
          <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(school.userCode)}</td>
          <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(school.schoolName)}</td>
          <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(school.areaService)}</td>
          <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(school.email)}</td>
          <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(getStatusDisplayName(school.isActive))}</td>
          <td class="px-4 py-3 text-sm text-slate-700">
            <button type="button" data-action="detail" data-usercode="${escapeHtml(school.userCode)}" class="rounded-md bg-sky-100 text-sky-800 px-3 py-1.5 text-xs font-medium hover:bg-sky-200">
              รายละเอียด
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  if (paginationBody) {
    paginationBody.innerHTML = renderPaginationControls(pagination);
  }
}

function bindSchoolsEvents() {
  const searchInput = document.getElementById("schools-search-input");
  const tableBody = document.getElementById("schools-table-body");
  const paginationBody = document.getElementById("schools-pagination");

  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      schoolsCurrentPage = 1;
      renderSchoolsTableRows(event.target.value);
    });
  }

  if (paginationBody) {
    paginationBody.addEventListener("click", (event) => {
      const target = event.target.closest("button[data-page-target],button[data-page-action]");
      if (!target || target.disabled) {
        return;
      }

      const searchValue = searchInput ? searchInput.value : "";
      const keyword = String(searchValue || "").trim().toLowerCase();
      const filteredSchools = schoolsState.filter((school) => {
        if (!keyword) {
          return true;
        }

        return (
          school.userCode.toLowerCase().includes(keyword) ||
          school.schoolName.toLowerCase().includes(keyword) ||
          school.areaService.toLowerCase().includes(keyword) ||
          school.email.toLowerCase().includes(keyword)
        );
      });
      const pagination = paginateData(filteredSchools, schoolsCurrentPage, TABLE_PAGE_SIZE);

      if (target.dataset.pageTarget) {
        schoolsCurrentPage = Number(target.dataset.pageTarget) || 1;
      } else if (target.dataset.pageAction === "prev") {
        schoolsCurrentPage = Math.max(1, pagination.currentPage - 1);
      } else if (target.dataset.pageAction === "next") {
        schoolsCurrentPage = Math.min(pagination.totalPages, pagination.currentPage + 1);
      } else {
        return;
      }

      renderSchoolsTableRows(searchValue);
    });
  }

  if (tableBody) {
    tableBody.addEventListener("click", (event) => {
      const target = event.target.closest("button[data-action='detail']");
      if (!target) {
        return;
      }

      const userCode = String(target.dataset.usercode || "").trim();
      if (!userCode) {
        return;
      }

      openSubmissionDetailModal(userCode);
    });
  }

  const closeButton = document.getElementById("submission-detail-close-btn");
  const modal = document.getElementById("submission-detail-modal");
  if (closeButton) {
    closeButton.addEventListener("click", closeSubmissionDetailModal);
  }
  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target.id === "submission-detail-modal") {
        closeSubmissionDetailModal();
      }
    });
  }
}

function renderSchools() {
  const pageContent = document.getElementById("page-content");
  if (!pageContent) {
    return;
  }

  pageContent.innerHTML = `
    <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h2 class="text-lg font-semibold text-slate-900">รายชื่อโรงเรียน</h2>
      </div>

      <div class="mt-4">
        <label for="schools-search-input" class="block text-sm font-medium text-slate-700 mb-1">ค้นหา</label>
        <input
          id="schools-search-input"
          type="text"
          placeholder="ค้นหา รหัส, โรงเรียน, สังกัด, อีเมล"
          class="w-full md:max-w-md rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
        />
      </div>

      <div class="mt-5 overflow-x-auto rounded-xl border border-slate-200">
        <table class="min-w-full bg-white">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">รหัส</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">โรงเรียน</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">สังกัด</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">อีเมล</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">สถานะ</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">จัดการ</th>
            </tr>
          </thead>
          <tbody id="schools-table-body"></tbody>
        </table>
      </div>

      <div id="schools-pagination" class="mt-4"></div>
    </div>

    ${renderSubmissionDetailModal()}
  `;

  bindSchoolsEvents();
  fetchSchools();
}

function getSubmissionOverallBadgeClass(status) {
  const normalized = String(status || "").trim();
  if (normalized === "ส่งครบ") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (normalized === "ส่งบางส่วน") {
    return "bg-amber-100 text-amber-800";
  }
  return "bg-slate-100 text-slate-700";
}

function isSubmissionSent(status, fileValue) {
  if (fileValue) {
    return true;
  }
  return String(status || "").trim() === "ส่งแล้ว";
}

function computeOverallSubmissionStatus(row) {
  const sentEarly = isSubmissionSent(row.earlyStatus || row.early_status, row.earlyFile || row.early_file);
  const sentLower = isSubmissionSent(row.lowerStatus || row.lower_status, row.lowerFile || row.lower_file);
  const sentUpper = isSubmissionSent(row.upperStatus || row.upper_status, row.upperFile || row.upper_file);
  const sentCount = [sentEarly, sentLower, sentUpper].filter(Boolean).length;

  if (sentCount === 3) {
    return "ส่งครบ";
  }
  if (sentCount === 0) {
    return "ยังไม่ส่ง";
  }
  return "ส่งบางส่วน";
}

function getCurrentSchoolSubmissionRow() {
  if (!currentUser || normalizeRole(currentUser.role) !== "school") {
    return null;
  }

  const schoolCode = String(currentUser.schoolCode || currentUser.userCode || "").trim();
  if (!schoolCode) {
    return null;
  }

  return submissionStatusState.find((row) => String(row.userCode || "").trim() === schoolCode) || null;
}

function formatSubmittedAt(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("th-TH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderSubmissionDetailFileRow(label, url, name) {
  const displayName = name || "-";
  const actionButton = url
    ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="rounded-md bg-sky-100 text-sky-800 px-3 py-1.5 text-xs font-medium hover:bg-sky-200">เปิด PDF</a>`
    : '<span class="text-xs text-slate-500">ยังไม่ส่ง</span>';

  return `
    <div class="flex items-center justify-between gap-3 py-2 border-b border-slate-100 last:border-b-0">
      <div>
        <p class="text-sm text-slate-700">${escapeHtml(label)}</p>
        <p class="text-xs text-slate-500 break-all">${escapeHtml(displayName)}</p>
      </div>
      ${actionButton}
    </div>
  `;
}

function renderSubmissionDetailContent() {
  if (submissionDetailLoading) {
    return '<p class="text-sm text-slate-500">กำลังโหลดรายละเอียด...</p>';
  }

  if (submissionDetailErrorMessage) {
    return `<p class="text-sm text-rose-600">${escapeHtml(submissionDetailErrorMessage)}</p>`;
  }

  if (!submissionDetailData) {
    return '<p class="text-sm text-slate-500">ไม่พบข้อมูลรายละเอียด</p>';
  }

  const badgeClass = getSubmissionOverallBadgeClass(submissionDetailData.overallStatus);
  const requesterRole = normalizeRole(currentUser && currentUser.role);
  const resolvedSchoolName = requesterRole === "school"
    ? (currentUser && (currentUser.school || currentUser.name) ? (currentUser.school || currentUser.name) : submissionDetailData.schoolName)
    : submissionDetailData.schoolName;
  return `
    <div class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <div>
          <p class="text-slate-500">ชื่อโรงเรียน</p>
          <p class="font-medium text-slate-800">${escapeHtml(resolvedSchoolName || "-")}</p>
        </div>
        <div>
          <p class="text-slate-500">สถานะรวม</p>
          <p><span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass}">${escapeHtml(submissionDetailData.overallStatus || "ยังไม่ส่ง")}</span></p>
        </div>
        <div>
          <p class="text-slate-500">วันเวลาส่ง</p>
          <p class="font-medium text-slate-800">${escapeHtml(formatSubmittedAt(submissionDetailData.uploadedAt))}</p>
        </div>
        <div>
          <p class="text-slate-500">อัปเดตล่าสุด</p>
          <p class="font-medium text-slate-800">${escapeHtml(formatSubmittedAt(submissionDetailData.updatedAt))}</p>
        </div>
      </div>

      <div>
        <h4 class="text-sm font-semibold text-slate-800 mb-2">รายการไฟล์</h4>
        <div class="rounded-lg border border-slate-200 px-3">
          ${renderSubmissionDetailFileRow("หลักสูตรปฐมวัย", submissionDetailData.earlyFileUrl, submissionDetailData.earlyFileName)}
          ${renderSubmissionDetailFileRow("หลักสูตรประถมต้น", submissionDetailData.lowerFileUrl, submissionDetailData.lowerFileName)}
          ${renderSubmissionDetailFileRow("หลักสูตรประถมปลาย", submissionDetailData.upperFileUrl, submissionDetailData.upperFileName)}
        </div>
      </div>
    </div>
  `;
}

function renderSubmissionDetailModal() {
  return `
    <div id="submission-detail-modal" class="fixed inset-0 bg-black/40 hidden flex items-center justify-center p-4">
      <div class="w-full max-w-2xl rounded-2xl bg-white border border-slate-200 shadow-xl p-6">
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-lg font-semibold text-slate-900">รายละเอียดการส่งงาน</h3>
          <button id="submission-detail-close-btn" type="button" class="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100">ปิด</button>
        </div>
        <div id="submission-detail-content" class="mt-4">
          ${renderSubmissionDetailContent()}
        </div>
      </div>
    </div>
  `;
}

function closeSubmissionDetailModal() {
  const modal = document.getElementById("submission-detail-modal");
  if (!modal) {
    return;
  }
  modal.classList.add("hidden");
}

async function openSubmissionDetailModal(userCode) {
  const modal = document.getElementById("submission-detail-modal");
  const content = document.getElementById("submission-detail-content");
  if (!modal || !content || !currentUser) {
    return;
  }

  const requesterRole = normalizeRole(currentUser.role);
  if (requesterRole === "school") {
    const ownCode = String(currentUser.schoolCode || currentUser.userCode || "").trim();
    if (String(userCode || "").trim() !== ownCode) {
      console.warn("Access denied: openSubmissionDetailModal – school can only view own detail");
      return;
    }
  } else if (requesterRole !== "admin" && requesterRole !== "staff") {
    console.warn("Access denied: openSubmissionDetailModal");
    return;
  }

  submissionDetailLoading = true;
  submissionDetailErrorMessage = "";
  submissionDetailData = null;
  content.innerHTML = renderSubmissionDetailContent();
  modal.classList.remove("hidden");

  try {
    const response = await fetch(USERS_API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "getSubmissionDetail",
        userCode,
        ...buildRequesterPayload(),
      }),
    });

    const rawText = await response.text();
    let result;
    try {
      result = JSON.parse(rawText);
    } catch {
      throw new Error("รูปแบบข้อมูลตอบกลับไม่ถูกต้อง");
    }

    if (!response.ok) {
      throw new Error((result && result.message) || "ไม่สามารถโหลดรายละเอียดได้");
    }

    if (result && result.success === false) {
      throw new Error(result.message || "ไม่สามารถโหลดรายละเอียดได้");
    }

    submissionDetailData = normalizeSubmissionDetail(result && result.data ? result.data : null);
  } catch (error) {
    submissionDetailErrorMessage = error.message || "ไม่สามารถโหลดรายละเอียดได้";
  } finally {
    submissionDetailLoading = false;
    content.innerHTML = renderSubmissionDetailContent();
  }
}

async function fetchSubmissionStatuses() {
  submissionStatusLoading = true;
  submissionStatusErrorMessage = "";
  renderSubmissionStatusRows(document.getElementById("submission-status-search-input")?.value || "");

  try {
    const response = await fetch(USERS_API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "getSubmissionStatus",
        ...buildRequesterPayload(),
      }),
    });

    const rawText = await response.text();
    let result;

    try {
      result = JSON.parse(rawText);
    } catch {
      throw new Error("รูปแบบข้อมูลตอบกลับไม่ถูกต้อง");
    }

    if (!response.ok) {
      throw new Error((result && result.message) || "ไม่สามารถโหลดข้อมูลสถานะการส่งงานได้");
    }

    if (result && result.success === false) {
      throw new Error(result.message || "ไม่สามารถโหลดข้อมูลสถานะการส่งงานได้");
    }

    const rows = Array.isArray(result)
      ? result
      : Array.isArray(result && result.data)
        ? result.data
        : [];

    const mappedRows = rows.map(normalizeSubmission);

    mappedRows.sort((a, b) =>
      String(a.userCode || "").localeCompare(String(b.userCode || ""), "th", {
        numeric: true,
        sensitivity: "base",
      })
    );

    if (currentUser && normalizeRole(currentUser.role) === "school") {
      const schoolCode = String(currentUser.schoolCode || currentUser.userCode || "").trim();
      submissionStatusState = mappedRows.filter((row) => String(row.userCode || "").trim() === schoolCode);
    } else {
      submissionStatusState = mappedRows;
    }
  } catch (error) {
    submissionStatusState = [];
    submissionStatusErrorMessage = error.message || "เกิดข้อผิดพลาดในการโหลดข้อมูลสถานะการส่งงาน";
  } finally {
    submissionStatusLoading = false;
    renderSubmissionStatusRows(document.getElementById("submission-status-search-input")?.value || "");
  }
}

function renderSubmissionStatusRows(searchText) {
  const tableBody = document.getElementById("submission-status-table-body");
  const paginationBody = document.getElementById("submission-status-pagination");
  const role = normalizeRole(currentUser && currentUser.role);
  const isAdminOrStaff = role === "admin" || role === "staff";
  const colspan = isAdminOrStaff ? 8 : 7;
  if (!tableBody) {
    return;
  }

  if (submissionStatusLoading) {
    tableBody.innerHTML =
      `<tr><td colspan="${colspan}" class="px-4 py-6 text-center text-slate-500">กำลังโหลดข้อมูล...</td></tr>`;
    if (paginationBody) {
      paginationBody.innerHTML = "";
    }
    return;
  }

  if (submissionStatusErrorMessage) {
    tableBody.innerHTML =
      `<tr><td colspan="${colspan}" class="px-4 py-6 text-center text-rose-600">${escapeHtml(submissionStatusErrorMessage)}</td></tr>`;
    if (paginationBody) {
      paginationBody.innerHTML = "";
    }
    return;
  }

  const keyword = String(searchText || "").trim().toLowerCase();
  const filteredRows = submissionStatusState.filter((item) => {
    if (!keyword) {
      return true;
    }

    return (
      item.userCode.toLowerCase().includes(keyword) ||
      item.schoolName.toLowerCase().includes(keyword) ||
      item.areaService.toLowerCase().includes(keyword) ||
      item.overallStatus.toLowerCase().includes(keyword)
    );
  });

  if (filteredRows.length === 0) {
    tableBody.innerHTML =
      `<tr><td colspan="${colspan}" class="px-4 py-6 text-center text-slate-500">ไม่พบข้อมูล</td></tr>`;
    if (paginationBody) {
      paginationBody.innerHTML = "";
    }
    return;
  }

  const pagination = paginateData(filteredRows, submissionStatusCurrentPage, TABLE_PAGE_SIZE);
  submissionStatusCurrentPage = pagination.currentPage;

  tableBody.innerHTML = pagination.items
    .map((item) => {
      const overallClass = getSubmissionOverallBadgeClass(item.overallStatus);
      const codeCell = isAdminOrStaff
        ? `<td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(item.userCode)}</td>`
        : "";
      return `
        <tr class="border-t border-slate-200">
          ${codeCell}
          <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(item.schoolName)}</td>
          <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(item.earlyStatus)}</td>
          <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(item.lowerStatus)}</td>
          <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(item.upperStatus)}</td>
          <td class="px-4 py-3 text-sm text-slate-700"><span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${overallClass}">${escapeHtml(item.overallStatus)}</span></td>
          <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(item.latestSubmittedAt ? formatSubmittedAt(item.latestSubmittedAt) : "-")}</td>
          <td class="px-4 py-3 text-sm text-slate-700">
            <button type="button" data-action="detail" data-usercode="${escapeHtml(item.userCode)}" class="rounded-md bg-sky-100 text-sky-800 px-3 py-1.5 text-xs font-medium hover:bg-sky-200">
              รายละเอียด
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  if (paginationBody) {
    paginationBody.innerHTML = renderPaginationControls(pagination);
  }
}

function bindSubmissionStatusEvents() {
  const searchInput = document.getElementById("submission-status-search-input");
  const tableBody = document.getElementById("submission-status-table-body");
  const paginationBody = document.getElementById("submission-status-pagination");

  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      submissionStatusCurrentPage = 1;
      renderSubmissionStatusRows(event.target.value);
    });
  }

  if (paginationBody) {
    paginationBody.addEventListener("click", (event) => {
      const target = event.target.closest("button[data-page-target],button[data-page-action]");
      if (!target || target.disabled) {
        return;
      }

      const searchValue = searchInput ? searchInput.value : "";
      const keyword = String(searchValue || "").trim().toLowerCase();
      const filteredRows = submissionStatusState.filter((item) => {
        if (!keyword) {
          return true;
        }

        return (
          item.userCode.toLowerCase().includes(keyword) ||
          item.schoolName.toLowerCase().includes(keyword) ||
          item.areaService.toLowerCase().includes(keyword) ||
          item.overallStatus.toLowerCase().includes(keyword)
        );
      });
      const pagination = paginateData(filteredRows, submissionStatusCurrentPage, TABLE_PAGE_SIZE);

      if (target.dataset.pageTarget) {
        submissionStatusCurrentPage = Number(target.dataset.pageTarget) || 1;
      } else if (target.dataset.pageAction === "prev") {
        submissionStatusCurrentPage = Math.max(1, pagination.currentPage - 1);
      } else if (target.dataset.pageAction === "next") {
        submissionStatusCurrentPage = Math.min(pagination.totalPages, pagination.currentPage + 1);
      } else {
        return;
      }

      renderSubmissionStatusRows(searchValue);
    });
  }

  if (tableBody) {
    tableBody.addEventListener("click", (event) => {
      const target = event.target.closest("button[data-action='detail']");
      if (!target) {
        return;
      }

      const userCode = String(target.dataset.usercode || "").trim();
      if (!userCode) {
        return;
      }
      openSubmissionDetailModal(userCode);
    });
  }

  const closeButton = document.getElementById("submission-detail-close-btn");
  const modal = document.getElementById("submission-detail-modal");
  if (closeButton) {
    closeButton.addEventListener("click", closeSubmissionDetailModal);
  }
  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target.id === "submission-detail-modal") {
        closeSubmissionDetailModal();
      }
    });
  }
}

function renderSubmissionStatuses() {
  const pageContent = document.getElementById("page-content");
  if (!pageContent) {
    return;
  }

  submissionStatusCurrentPage = 1;
  const role = normalizeRole(currentUser && currentUser.role);
  const isAdminOrStaff = role === "admin" || role === "staff";
  const showSearchBox = role !== "school";
  const codeHeader = isAdminOrStaff
    ? '<th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">รหัส</th>'
    : "";
  const searchPlaceholder = isAdminOrStaff
    ? "ค้นหา รหัส, โรงเรียน, สังกัด, สถานะรวม"
    : "ค้นหา โรงเรียน, สังกัด, สถานะรวม";

  const searchMarkup = showSearchBox
    ? `
      <div class="mt-4">
        <label for="submission-status-search-input" class="block text-sm font-medium text-slate-700 mb-1">ค้นหา</label>
        <input
          id="submission-status-search-input"
          type="text"
          placeholder="${searchPlaceholder}"
          class="w-full md:max-w-md rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
        />
      </div>
    `
    : "";

  pageContent.innerHTML = `
    <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h2 class="text-lg font-semibold text-slate-900">สถานะการส่งงาน</h2>
      </div>

      ${searchMarkup}

      <div class="mt-5 overflow-x-auto rounded-xl border border-slate-200">
        <table class="min-w-full bg-white">
          <thead class="bg-slate-50">
            <tr>
              ${codeHeader}
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">โรงเรียน</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">ปฐมวัย</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">ประถมต้น</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">ประถมปลาย</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">สถานะ</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">ส่งล่าสุด</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">ดูรายละเอียด</th>
            </tr>
          </thead>
          <tbody id="submission-status-table-body"></tbody>
        </table>
      </div>

      <div id="submission-status-pagination" class="mt-4"></div>
    </div>

    ${renderSubmissionDetailModal()}
  `;

  bindSubmissionStatusEvents();
  fetchSubmissionStatuses();
}

function renderCurriculumUploadMessage() {
  if (!curriculumUploadMessage) {
    return "";
  }

  const className =
    curriculumUploadMessageType === "success"
      ? "text-emerald-700"
      : curriculumUploadMessageType === "error"
        ? "text-rose-600"
        : "text-sky-700";

  return `<p class="text-sm font-medium ${className}">${escapeHtml(curriculumUploadMessage)}</p>`;
}

function resetCurriculumUploadForm() {
  const earlyInput = document.getElementById("curriculum-early-file");
  const lowerInput = document.getElementById("curriculum-lower-file");
  const upperInput = document.getElementById("curriculum-upper-file");

  if (earlyInput) {
    earlyInput.value = "";
  }
  if (lowerInput) {
    lowerInput.value = "";
  }
  if (upperInput) {
    upperInput.value = "";
  }
}

function validateCurriculumUploadFiles(files) {
  if (!files.upper) {
    return "กรุณาเลือกไฟล์หลักสูตรประถมปลาย";
  }

  const selectedFiles = [files.early, files.lower, files.upper].filter(Boolean);
  for (let index = 0; index < selectedFiles.length; index++) {
    const file = selectedFiles[index];
    const mimeType = String(file.type || "").trim().toLowerCase();
    const isPdfByMime = mimeType === "application/pdf";
    const isPdfByName = String(file.name || "").toLowerCase().endsWith(".pdf");

    if (!isPdfByMime && !isPdfByName) {
      return "ทุกไฟล์ต้องเป็น PDF";
    }

    if (file.size > MAX_UPLOAD_FILE_SIZE) {
      return "ทุกไฟล์ต้องไม่เกิน 5 MB";
    }
  }

  return "";
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };

    reader.onerror = () => {
      reject(new Error("ไม่สามารถอ่านไฟล์ได้"));
    };

    reader.readAsDataURL(file);
  });
}

async function buildUploadFilePayload(file) {
  if (!file) {
    return null;
  }

  const base64 = await fileToBase64(file);
  return {
    fileName: file.name,
    mimeType: file.type || "application/pdf",
    base64,
  };
}

async function submitCurriculumUpload() {
  if (!currentUser || normalizeRole(currentUser.role) !== "school") {
    console.warn("Access denied: submitCurriculumUpload");
    return;
  }
  if (curriculumUploadLoading) {
    return;
  }

  const submitButton = document.getElementById("curriculum-upload-submit-btn");
  const earlyInput = document.getElementById("curriculum-early-file");
  const lowerInput = document.getElementById("curriculum-lower-file");
  const upperInput = document.getElementById("curriculum-upper-file");

  if (!submitButton || !earlyInput || !lowerInput || !upperInput || !currentUser) {
    return;
  }

  const files = {
    early: earlyInput.files && earlyInput.files[0] ? earlyInput.files[0] : null,
    lower: lowerInput.files && lowerInput.files[0] ? lowerInput.files[0] : null,
    upper: upperInput.files && upperInput.files[0] ? upperInput.files[0] : null,
  };

  const validationMessage = validateCurriculumUploadFiles(files);
  if (validationMessage) {
    curriculumUploadMessage = validationMessage;
    curriculumUploadMessageType = "error";
    renderCurriculumSubmitPage();
    return;
  }

  curriculumUploadLoading = true;
  curriculumUploadMessage = "กำลังอัปโหลด...";
  curriculumUploadMessageType = "info";
  renderCurriculumSubmitPage();
  showLoading("กำลังส่งงาน...");

  try {
    const payloadFiles = {
      early: await buildUploadFilePayload(files.early),
      lower: await buildUploadFilePayload(files.lower),
      upper: await buildUploadFilePayload(files.upper),
    };

    const response = await fetch(USERS_API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "uploadSubmission",
        userCode: currentUser.userCode,
        schoolName: currentUser.school || currentUser.name,
        files: payloadFiles,
        ...buildRequesterPayload(),
      }),
    });

    const rawText = await response.text();
    let result;
    try {
      result = JSON.parse(rawText);
    } catch {
      throw new Error("รูปแบบข้อมูลตอบกลับไม่ถูกต้อง");
    }

    if (!response.ok) {
      throw new Error((result && result.message) || "ไม่สามารถอัปโหลดไฟล์ได้");
    }

    if (result && result.success === false) {
      throw new Error(result.message || "ไม่สามารถอัปโหลดไฟล์ได้");
    }

    await fetchSubmissionStatuses();

    curriculumUploadMessage = "ส่งงานสำเร็จ";
    curriculumUploadMessageType = "success";
    curriculumUploadLoading = false;
    resetCurriculumUploadForm();
    renderCurriculumSubmitPage();
    await showSuccess("ส่งงานสำเร็จ");
  } catch (error) {
    curriculumUploadMessage = error.message || "ไม่สามารถอัปโหลดไฟล์ได้";
    curriculumUploadMessageType = "error";
    curriculumUploadLoading = false;
    renderCurriculumSubmitPage();
    await showError(error.message || "ไม่สามารถอัปโหลดไฟล์ได้");
  } finally {
    closeLoading();
  }
}

function bindCurriculumSubmitEvents() {
  const submitButton = document.getElementById("curriculum-upload-submit-btn");
  if (submitButton) {
    submitButton.addEventListener("click", submitCurriculumUpload);
  }
}

function renderCurriculumSubmitPage() {
  const pageContent = document.getElementById("page-content");
  if (!pageContent) {
    return;
  }

  const buttonText = curriculumUploadLoading ? "กำลังอัปโหลด..." : "ส่งงาน";
  const disabledAttr = curriculumUploadLoading ? "disabled" : "";
  const currentStatus = getCurrentSchoolSubmissionRow();
  const statusBadgeClass = getSubmissionOverallBadgeClass(currentStatus ? currentStatus.overallStatus : "ยังไม่ส่ง");

  pageContent.innerHTML = `
    <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
      <div>
        <h2 class="text-lg font-semibold text-slate-900">ส่งงานหลักสูตร</h2>
        <p class="text-sm text-slate-600 mt-1">อัปโหลดไฟล์หลักสูตรในรูปแบบ PDF</p>
      </div>

      <div class="space-y-4">
        <div>
          <label for="curriculum-early-file" class="block text-sm font-medium text-slate-700 mb-1">หลักสูตรปฐมวัย</label>
          <input id="curriculum-early-file" type="file" accept="application/pdf,.pdf" class="block w-full text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-800 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-900" />
        </div>

        <div>
          <label for="curriculum-lower-file" class="block text-sm font-medium text-slate-700 mb-1">หลักสูตรประถมต้น</label>
          <input id="curriculum-lower-file" type="file" accept="application/pdf,.pdf" class="block w-full text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-800 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-900" />
        </div>

        <div>
          <label for="curriculum-upper-file" class="block text-sm font-medium text-slate-700 mb-1">หลักสูตรประถมปลาย <span class="text-rose-600">*</span></label>
          <input id="curriculum-upper-file" type="file" accept="application/pdf,.pdf" class="block w-full text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-800 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-900" />
        </div>
      </div>

      <p class="text-xs text-slate-500">รองรับเฉพาะไฟล์ PDF และขนาดไฟล์ไม่เกิน 5 MB</p>

      <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p class="text-sm text-slate-700">สถานะล่าสุดของโรงเรียน</p>
        <div class="mt-2 flex flex-wrap items-center gap-3">
          <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass}">${escapeHtml(currentStatus ? currentStatus.overallStatus : "ยังไม่ส่ง")}</span>
          <span class="text-xs text-slate-500">อัปเดตล่าสุด: ${escapeHtml(formatSubmittedAt(currentStatus ? currentStatus.latestSubmittedAt : null))}</span>
        </div>
      </div>

      <div id="curriculum-upload-message" class="min-h-5">
        ${renderCurriculumUploadMessage()}
      </div>

      <div class="flex justify-end">
        <button id="curriculum-upload-submit-btn" type="button" class="rounded-lg bg-slate-800 text-white px-5 py-2.5 text-sm font-medium hover:bg-slate-900 transition-colors disabled:opacity-60 disabled:cursor-not-allowed" ${disabledAttr}>
          ${buttonText}
        </button>
      </div>
    </div>
  `;

  bindCurriculumSubmitEvents();
}

function renderUsersFeedback() {
  const feedbackBox = document.getElementById("users-feedback");
  if (!feedbackBox) {
    return;
  }

  if (!usersFeedbackMessage) {
    feedbackBox.textContent = "";
    feedbackBox.className = "text-sm min-h-5";
    return;
  }

  feedbackBox.textContent = usersFeedbackMessage;
  feedbackBox.className = "text-sm min-h-5 text-emerald-700";
}

function renderUsersTableRows(searchText) {
  const tableBody = document.getElementById("users-table-body");
  const paginationBody = document.getElementById("users-pagination");
  if (!tableBody) {
    return;
  }

  if (usersLoading) {
    tableBody.innerHTML =
      '<tr><td colspan="7" class="px-4 py-6 text-center text-slate-500">กำลังโหลดข้อมูล...</td></tr>';
    if (paginationBody) {
      paginationBody.innerHTML = "";
    }
    return;
  }

  if (usersErrorMessage) {
    tableBody.innerHTML =
      `<tr><td colspan="7" class="px-4 py-6 text-center text-rose-600">${escapeHtml(usersErrorMessage)}</td></tr>`;
    if (paginationBody) {
      paginationBody.innerHTML = "";
    }
    return;
  }

  const keyword = String(searchText || "").trim().toLowerCase();
  const filteredUsers = usersState.filter((user) => {
    if (!keyword) {
      return true;
    }

    return (
      user.userCode.toLowerCase().includes(keyword) ||
      user.name.toLowerCase().includes(keyword) ||
      user.areaService.toLowerCase().includes(keyword) ||
      user.email.toLowerCase().includes(keyword) ||
      user.role.toLowerCase().includes(keyword)
    );
  });

  if (filteredUsers.length === 0) {
    tableBody.innerHTML =
      '<tr><td colspan="7" class="px-4 py-6 text-center text-slate-500">ไม่พบข้อมูลผู้ใช้งาน</td></tr>';
    if (paginationBody) {
      paginationBody.innerHTML = "";
    }
    return;
  }

  const pagination = paginateData(filteredUsers, usersCurrentPage, TABLE_PAGE_SIZE);
  usersCurrentPage = pagination.currentPage;

  tableBody.innerHTML = pagination.items
    .map((user) => {
      return `
        <tr class="border-t border-slate-200">
          <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(user.userCode)}</td>
          <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(user.name)}</td>
          <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(user.areaService)}</td>
          <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(user.email)}</td>
          <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(getRoleDisplayName(user.role))}</td>
          <td class="px-4 py-3 text-sm text-slate-700">${escapeHtml(getStatusDisplayName(user.isActive))}</td>
          <td class="px-4 py-3 text-sm text-slate-700">
            <div class="flex items-center gap-2">
              <button type="button" data-action="edit" data-usercode="${escapeHtml(user.userCode)}" class="rounded-md bg-amber-100 text-amber-800 px-3 py-1.5 text-xs font-medium hover:bg-amber-200">แก้ไข</button>
              <button type="button" data-action="delete" data-usercode="${escapeHtml(user.userCode)}" class="rounded-md bg-rose-100 text-rose-700 px-3 py-1.5 text-xs font-medium hover:bg-rose-200">ลบ</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  if (paginationBody) {
    paginationBody.innerHTML = renderPaginationControls(pagination);
  }
}

function closeUsersModal() {
  const modal = document.getElementById("users-modal");
  if (!modal) {
    return;
  }
  modal.classList.add("hidden");
}

function openUsersModal(mode, user) {
  const modal = document.getElementById("users-modal");
  const title = document.getElementById("users-modal-title");
  const saveButton = document.getElementById("users-save-btn");

  if (!modal || !title || !saveButton) {
    return;
  }

  const editingUserCode = user ? user.userCode : "";
  modal.dataset.mode = mode;
  modal.dataset.editingUserCode = editingUserCode;
  modal.dataset.editingId = user ? String(user.id) : "";

  title.textContent = mode === "add" ? "เพิ่มผู้ใช้งาน" : "แก้ไขผู้ใช้งาน";
  saveButton.textContent = mode === "add" ? "บันทึกผู้ใช้งาน" : "บันทึกการแก้ไข";
  saveButton.disabled = false;

  const userCodeInput = document.getElementById("user-code-input");
  userCodeInput.value = user ? user.userCode : "";
  userCodeInput.disabled = mode === "edit";

  document.getElementById("user-name-input").value = user ? user.name : "";
  document.getElementById("user-school-name-input").value = user ? user.schoolName : "";
  document.getElementById("user-area-service-input").value = user ? user.areaService : "";
  document.getElementById("user-email-input").value = user ? user.email : "";
  document.getElementById("user-password-input").value = "";
  document.getElementById("user-role-input").value = user ? user.role : "school";
  document.getElementById("user-status-input").value = user ? (user.isActive ? "active" : "inactive") : "active";
  document.getElementById("users-modal-error").textContent = "";

  modal.classList.remove("hidden");
}

async function upsertUserFromModal() {
  if (!currentUser || normalizeRole(currentUser.role) !== "admin") {
    console.warn("Access denied: upsertUserFromModal");
    return;
  }
  const modal = document.getElementById("users-modal");
  const saveButton = document.getElementById("users-save-btn");
  const errorBox = document.getElementById("users-modal-error");
  if (!modal || !saveButton || !errorBox) {
    return;
  }

  const mode = modal.dataset.mode || "add";

  const name = document.getElementById("user-name-input").value.trim();
  const schoolName = document.getElementById("user-school-name-input").value.trim();
  const areaService = document.getElementById("user-area-service-input").value.trim();
  const email = document.getElementById("user-email-input").value.trim();
  const role = document.getElementById("user-role-input").value;
  const isActive = document.getElementById("user-status-input").value === "active";

  if (mode === "edit") {
    const id = modal.dataset.editingId;

    if (!id) {
      errorBox.textContent = "ไม่พบ id ผู้ใช้งาน";
      return;
    }

    if (!name) {
      errorBox.textContent = "name ห้ามว่าง";
      return;
    }

    if (!email) {
      errorBox.textContent = "email ห้ามว่าง";
      return;
    }

    if (!role) {
      errorBox.textContent = "role ห้ามว่าง";
      return;
    }

    errorBox.textContent = "";
    saveButton.disabled = true;
    showLoading("กำลังบันทึกผู้ใช้งาน...");

    try {
      const response = await fetch(USERS_API_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "updateUser",
          id: Number(id),
          name,
          schoolName,
          areaService,
          email,
          role,
          isActive,
          ...buildRequesterPayload(),
        }),
      });

      const rawText = await response.text();
      let result;
      try {
        result = JSON.parse(rawText);
      } catch {
        throw new Error("รูปแบบข้อมูลตอบกลับไม่ถูกต้อง");
      }

      if (result && result.success === false) {
        throw new Error(result.message || "ไม่สามารถแก้ไขผู้ใช้งานได้");
      }

      usersFeedbackMessage = "แก้ไขผู้ใช้งานสำเร็จ";
      closeUsersModal();
      renderUsersFeedback();
      await fetchUsers();
      await showSuccess("แก้ไขผู้ใช้งานสำเร็จ");
    } catch (error) {
      errorBox.textContent = error.message || "ไม่สามารถแก้ไขผู้ใช้งานได้";
      await showError(error.message || "ไม่สามารถแก้ไขผู้ใช้งานได้");
    } finally {
      closeLoading();
      saveButton.disabled = false;
    }

    return;
  }

  // mode === "add"
  const userCode = document.getElementById("user-code-input").value.trim();
  const password = document.getElementById("user-password-input").value.trim();

  if (!userCode) {
    errorBox.textContent = "userCode ห้ามว่าง";
    return;
  }

  if (!name) {
    errorBox.textContent = "name ห้ามว่าง";
    return;
  }

  if (!email) {
    errorBox.textContent = "email ห้ามว่าง";
    return;
  }

  if (!password) {
    errorBox.textContent = "password ห้ามว่าง";
    return;
  }

  if (!role) {
    errorBox.textContent = "role ห้ามว่าง";
    return;
  }

  errorBox.textContent = "";
  saveButton.disabled = true;
  showLoading("กำลังบันทึกผู้ใช้งาน...");

  try {
    const response = await fetch(USERS_API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "createUser",
        userCode,
        name,
        schoolName,
        areaService,
        email,
        password,
        role,
        isActive,
        ...buildRequesterPayload(),
      }),
    });

    const rawText = await response.text();
    let result;

    try {
      result = JSON.parse(rawText);
    } catch {
      throw new Error("รูปแบบข้อมูลตอบกลับไม่ถูกต้อง");
    }

    if (!response.ok) {
      throw new Error("ไม่สามารถเพิ่มผู้ใช้งานได้");
    }

    if (result && result.success === false) {
      throw new Error(result.message || "ไม่สามารถเพิ่มผู้ใช้งานได้");
    }

    usersFeedbackMessage = "เพิ่มผู้ใช้งานสำเร็จ";
    closeUsersModal();
    renderUsersFeedback();
    await fetchUsers();
    await showSuccess("เพิ่มผู้ใช้งานสำเร็จ");
  } catch (error) {
    errorBox.textContent = error.message || "ไม่สามารถเพิ่มผู้ใช้งานได้";
    await showError(error.message || "ไม่สามารถเพิ่มผู้ใช้งานได้");
  } finally {
    closeLoading();
    saveButton.disabled = false;
  }
}

function bindUsersEvents() {
  const searchInput = document.getElementById("users-search-input");
  const addButton = document.getElementById("users-add-btn");
  const tableBody = document.getElementById("users-table-body");
  const paginationBody = document.getElementById("users-pagination");
  const modalCancel = document.getElementById("users-cancel-btn");
  const modalSave = document.getElementById("users-save-btn");
  const modalBackdrop = document.getElementById("users-modal");

  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      usersCurrentPage = 1;
      renderUsersTableRows(event.target.value);
    });
  }

  if (paginationBody) {
    paginationBody.addEventListener("click", (event) => {
      const target = event.target.closest("button[data-page-target],button[data-page-action]");
      if (!target || target.disabled) {
        return;
      }

      const searchValue = searchInput ? searchInput.value : "";
      const keyword = String(searchValue || "").trim().toLowerCase();
      const filteredUsers = usersState.filter((user) => {
        if (!keyword) {
          return true;
        }

        return (
          user.userCode.toLowerCase().includes(keyword) ||
          user.name.toLowerCase().includes(keyword) ||
          user.areaService.toLowerCase().includes(keyword) ||
          user.email.toLowerCase().includes(keyword) ||
          user.role.toLowerCase().includes(keyword)
        );
      });
      const pagination = paginateData(filteredUsers, usersCurrentPage, TABLE_PAGE_SIZE);

      if (target.dataset.pageTarget) {
        usersCurrentPage = Number(target.dataset.pageTarget) || 1;
      } else if (target.dataset.pageAction === "prev") {
        usersCurrentPage = Math.max(1, pagination.currentPage - 1);
      } else if (target.dataset.pageAction === "next") {
        usersCurrentPage = Math.min(pagination.totalPages, pagination.currentPage + 1);
      } else {
        return;
      }

      renderUsersTableRows(searchValue);
    });
  }

  if (addButton) {
    addButton.addEventListener("click", () => {
      openUsersModal("add");
    });
  }

  if (tableBody) {
    tableBody.addEventListener("click", async (event) => {
      const target = event.target.closest("button[data-action]");
      if (!target) {
        return;
      }

      if (!currentUser || normalizeRole(currentUser.role) !== "admin") {
        await showWarning("ไม่มีสิทธิ์ดำเนินการนี้");
        return;
      }

      const action = target.dataset.action;
      if (action === "delete") {
        const userCode = String(target.dataset.usercode || "").trim();
        const user = usersState.find((item) => item.userCode === userCode);

        if (!user) {
          await showError("ไม่พบข้อมูลผู้ใช้งาน");
          return;
        }

        if (String(currentUser.userCode || "").trim() === String(user.userCode || "").trim()) {
          await showWarning("ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่ได้");
          return;
        }

        const confirmed = await showConfirm("ยืนยันการลบผู้ใช้งานนี้หรือไม่");
        if (!confirmed) {
          return;
        }

        showLoading("กำลังลบผู้ใช้งาน...");

        try {
          const response = await fetch(USERS_API_URL, {
            method: "POST",
            body: JSON.stringify({
              action: "deleteUser",
              id: user.id,
              ...buildRequesterPayload(),
            }),
          });

          const rawText = await response.text();
          let result;

          try {
            result = JSON.parse(rawText);
          } catch {
            throw new Error("รูปแบบข้อมูลตอบกลับไม่ถูกต้อง");
          }

          if (!response.ok) {
            throw new Error((result && result.message) || "ไม่สามารถลบผู้ใช้งานได้");
          }

          if (result && result.success === false) {
            throw new Error(result.message || "ไม่สามารถลบผู้ใช้งานได้");
          }

          usersFeedbackMessage = "ลบผู้ใช้งานสำเร็จ";
          renderUsersFeedback();
          await fetchUsers();
          await showSuccess("ลบผู้ใช้งานสำเร็จ");
        } catch (error) {
          await showError(error.message || "ไม่สามารถลบผู้ใช้งานได้");
        } finally {
          closeLoading();
        }

        return;
      }

      if (action === "edit") {
        const userCode = target.dataset.usercode;
        const user = usersState.find((item) => item.userCode === userCode);
        if (user) {
          openUsersModal("edit", user);
        }
      }
    });
  }

  if (modalCancel) {
    modalCancel.addEventListener("click", closeUsersModal);
  }

  if (modalSave) {
    modalSave.addEventListener("click", upsertUserFromModal);
  }

  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", (event) => {
      if (event.target.id === "users-modal") {
        closeUsersModal();
      }
    });
  }
}

function renderUsers() {
  const pageContent = document.getElementById("page-content");
  if (!pageContent) {
    return;
  }

  pageContent.innerHTML = `
    <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h2 class="text-lg font-semibold text-slate-900">จัดการผู้ใช้งาน</h2>
        <button id="users-add-btn" type="button" class="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm font-medium hover:bg-slate-900 transition-colors">
          + เพิ่มผู้ใช้งาน
        </button>
      </div>

      <div class="mt-4">
        <label for="users-search-input" class="block text-sm font-medium text-slate-700 mb-1">ค้นหา</label>
        <input
          id="users-search-input"
          type="text"
          placeholder="ค้นหา รหัส, ชื่อ, สังกัด, อีเมล, บทบาท"
          class="w-full md:max-w-md rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
        />
        <p id="users-feedback" class="text-sm min-h-5 mt-2"></p>
      </div>

      <div class="mt-5 overflow-x-auto rounded-xl border border-slate-200">
        <table class="min-w-full bg-white">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">รหัส</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">ชื่อ</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">สังกัด</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">อีเมล</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">บทบาท</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">สถานะ</th>
              <th class="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">จัดการ</th>
            </tr>
          </thead>
          <tbody id="users-table-body"></tbody>
        </table>
      </div>

      <div id="users-pagination" class="mt-4"></div>
    </div>

    <div id="users-modal" class="fixed inset-0 bg-black/40 hidden flex items-center justify-center p-4">
      <div class="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-xl p-6">
        <h3 id="users-modal-title" class="text-lg font-semibold text-slate-900">เพิ่มผู้ใช้งาน</h3>

        <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label for="user-code-input" class="block text-sm text-slate-700 mb-1">รหัส</label>
            <input id="user-code-input" type="text" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label for="user-name-input" class="block text-sm text-slate-700 mb-1">ชื่อ</label>
            <input id="user-name-input" type="text" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div class="md:col-span-2">
            <label for="user-school-name-input" class="block text-sm text-slate-700 mb-1">schoolName</label>
            <input id="user-school-name-input" type="text" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div class="md:col-span-2">
            <label for="user-area-service-input" class="block text-sm text-slate-700 mb-1">areaService</label>
            <input id="user-area-service-input" type="text" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div class="md:col-span-2">
            <label for="user-email-input" class="block text-sm text-slate-700 mb-1">อีเมล</label>
            <input id="user-email-input" type="email" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div class="md:col-span-2">
            <label for="user-password-input" class="block text-sm text-slate-700 mb-1">password</label>
            <input id="user-password-input" type="password" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label for="user-role-input" class="block text-sm text-slate-700 mb-1">บทบาท</label>
            <select id="user-role-input" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="admin">ผู้ดูแลระบบ</option>
              <option value="staff">เจ้าหน้าที่</option>
              <option value="school">โรงเรียน</option>
            </select>
          </div>
          <div>
            <label for="user-status-input" class="block text-sm text-slate-700 mb-1">สถานะ</label>
            <select id="user-status-input" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="active">ใช้งาน</option>
              <option value="inactive">ปิดใช้งาน</option>
            </select>
          </div>
        </div>

        <p id="users-modal-error" class="text-sm text-rose-600 mt-3 min-h-5"></p>

        <div class="mt-4 flex justify-end gap-2">
          <button id="users-cancel-btn" type="button" class="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">
            ยกเลิก
          </button>
          <button id="users-save-btn" type="button" class="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm hover:bg-slate-900">
            บันทึกผู้ใช้งาน
          </button>
        </div>
      </div>
    </div>
  `;

  bindUsersEvents();
  renderUsersFeedback();
  fetchUsers();
}

function getDashboardStatNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function renderDashboardStatCard(title, value, accentBorderClass, numberClass) {
  return `
    <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm border-l-4 ${accentBorderClass}">
      <p class="text-sm text-slate-500">${escapeHtml(title)}</p>
      <p class="mt-2 text-3xl font-bold ${numberClass}">${escapeHtml(String(value))}</p>
    </div>
  `;
}

function renderDashboardWelcomeCard() {
  const roleLabel = ROLE_LABELS[currentUser.role] || currentUser.role;
  const currentStatus = getCurrentSchoolSubmissionRow();
  const statusText = currentStatus ? currentStatus.overallStatus : "ยังไม่ส่ง";

  return renderCard(
    "ภาพรวมผู้ใช้งาน",
    `
      <p>ผู้ใช้งาน: <span class="font-medium text-slate-800">${escapeHtml(currentUser.name)}</span> (<span class="font-medium text-slate-800">${escapeHtml(currentUser.userCode)}</span>)</p>
      <p class="mt-1">สิทธิ์: <span class="font-medium text-slate-800">${escapeHtml(roleLabel)}</span></p>
      <p class="mt-1">สังกัด: <span class="font-medium text-slate-800">${escapeHtml(currentUser.areaService)}</span></p>
      <p class="mt-2">สถานะการส่งงานล่าสุด: <span class="font-medium text-slate-800">${escapeHtml(statusText)}</span></p>
    `
  );
}

function formatDashboardLastUpdated(date) {
  if (!date) {
    return "-";
  }
  return date.toLocaleString("th-TH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function renderDashboardStatsSection() {
  if (dashboardStatsLoading) {
    return `
      <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h2 class="text-lg font-semibold text-slate-900">Dashboard Analytics</h2>
        <p class="mt-2 text-sm text-slate-500">กำลังโหลดข้อมูลสถิติ...</p>
      </div>
    `;
  }

  if (dashboardStatsErrorMessage) {
    return `
      <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h2 class="text-lg font-semibold text-slate-900">Dashboard Analytics</h2>
        <p class="mt-2 text-sm text-red-600">${escapeHtml(dashboardStatsErrorMessage)}</p>
        <button
          type="button"
          onclick="loadDashboardStats()"
          class="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
        >
          ลองใหม่
        </button>
      </div>
    `;
  }

  const stats = dashboardStatsData || {};
  const totalSchools = getDashboardStatNumber(stats.totalSchools);
  const completedSchools = getDashboardStatNumber(stats.completedSchools);
  const partialSchools = getDashboardStatNumber(stats.partialSchools);
  const notSubmittedSchools = getDashboardStatNumber(stats.notSubmittedSchools);
  const earlySubmittedCount = getDashboardStatNumber(stats.earlySubmittedCount);
  const lowerSubmittedCount = getDashboardStatNumber(stats.lowerSubmittedCount);
  const upperSubmittedCount = getDashboardStatNumber(stats.upperSubmittedCount);
  const lastUpdatedText = formatDashboardLastUpdated(dashboardStatsLastUpdated);

  return `
    <div class="space-y-5">
      <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h2 class="text-lg font-semibold text-slate-900">Dashboard Analytics</h2>
        <p class="mt-1 text-sm text-slate-600">สรุปภาพรวมการส่งงานหลักสูตรของทุกโรงเรียน</p>
        <p class="mt-1 text-xs text-slate-400">อัปเดตล่าสุด: ${escapeHtml(lastUpdatedText)}</p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        ${renderDashboardStatCard("จำนวนโรงเรียนทั้งหมด", totalSchools, "border-l-slate-400", "text-slate-900")}
        ${renderDashboardStatCard("ส่งครบแล้ว", completedSchools, "border-l-green-500", "text-green-700")}
        ${renderDashboardStatCard("ส่งบางส่วน", partialSchools, "border-l-amber-400", "text-amber-700")}
        ${renderDashboardStatCard("ยังไม่ส่ง", notSubmittedSchools, "border-l-red-400", "text-red-600")}
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        ${renderDashboardStatCard("ส่งปฐมวัย", earlySubmittedCount, "border-l-blue-400", "text-blue-700")}
        ${renderDashboardStatCard("ส่งประถมต้น", lowerSubmittedCount, "border-l-blue-500", "text-blue-700")}
        ${renderDashboardStatCard("ส่งประถมปลาย", upperSubmittedCount, "border-l-slate-500", "text-slate-700")}
      </div>
    </div>
  `;
}

function renderDashboardPage() {
  const pageContent = document.getElementById("page-content");
  if (!pageContent || !currentUser) {
    return;
  }

  if (normalizeRole(currentUser.role) === "school") {
    pageContent.innerHTML = renderDashboardWelcomeCard();
    return;
  }

  pageContent.innerHTML = renderDashboardStatsSection();
}

async function fetchDashboardStats() {
  if (!currentUser || !(["admin", "staff"].includes(normalizeRole(currentUser.role)))) {
    console.warn("Access denied: fetchDashboardStats");
    return;
  }
  dashboardStatsLoading = true;
  dashboardStatsErrorMessage = "";
  renderDashboardPage();

  try {
    const response = await fetch(USERS_API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "getDashboardStats",
        ...buildRequesterPayload(),
      }),
    });

    const rawText = await response.text();
    let result;

    try {
      result = JSON.parse(rawText);
    } catch {
      throw new Error("รูปแบบข้อมูลตอบกลับไม่ถูกต้อง");
    }

    if (!response.ok) {
      throw new Error((result && result.message) || "ไม่สามารถโหลดข้อมูล Dashboard ได้");
    }

    if (result && result.success === false) {
      throw new Error(result.message || "ไม่สามารถโหลดข้อมูล Dashboard ได้");
    }

    const data = result && result.data && typeof result.data === "object" ? result.data : result;

    dashboardStatsData = {
      totalSchools: getDashboardStatNumber(data && data.totalSchools),
      completedSchools: getDashboardStatNumber(data && data.completedSchools),
      partialSchools: getDashboardStatNumber(data && data.partialSchools),
      notSubmittedSchools: getDashboardStatNumber(data && data.notSubmittedSchools),
      earlySubmittedCount: getDashboardStatNumber(data && data.earlySubmittedCount),
      lowerSubmittedCount: getDashboardStatNumber(data && data.lowerSubmittedCount),
      upperSubmittedCount: getDashboardStatNumber(data && data.upperSubmittedCount),
    };
    dashboardStatsLastUpdated = new Date();
  } catch (error) {
    dashboardStatsData = null;
    dashboardStatsErrorMessage = error.message || "เกิดข้อผิดพลาดในการโหลดข้อมูล Dashboard";
  } finally {
    dashboardStatsLoading = false;
    if (currentPage === "dashboard") {
      renderDashboardPage();
    }
  }
}

function loadDashboardStats() {
  fetchDashboardStats();
}

function stopDashboardAutoRefresh() {
  if (dashboardStatsIntervalId !== null) {
    clearInterval(dashboardStatsIntervalId);
    dashboardStatsIntervalId = null;
  }
}

function startDashboardAutoRefresh() {
  stopDashboardAutoRefresh();
  dashboardStatsIntervalId = setInterval(() => {
    if (currentPage === "dashboard") {
      fetchDashboardStats();
    } else {
      stopDashboardAutoRefresh();
    }
  }, 60000);
}

function renderPage(page) {
  const pageContent = document.getElementById("page-content");
  if (!pageContent || !currentUser) {
    return;
  }

  if (!canAccessPage(page, currentUser)) {
    console.warn("Access denied (renderPage):", page);
    renderForbiddenPage();
    return;
  }

  if (page === "dashboard") {
    renderDashboardPage();

    if (normalizeRole(currentUser.role) !== "school") {
      loadDashboardStats();
      startDashboardAutoRefresh();
    }

    return;
  }

  if (page === "users") {
    renderUsers();
    return;
  }

  if (page === "import") {
    renderImportCsvPage();
    return;
  }

  if (page === "schools") {
    renderSchools();
    return;
  }

  if (page === "submissions") {
    renderSubmissionStatuses();
    return;
  }

  if (page === "school-info") {
    renderSchoolProfilePage();
    fetchSchoolProfile();
    return;
  }

  if (page === "curriculum-submit") {
    renderCurriculumSubmitPage();

    fetchSubmissionStatuses().then(() => {
      if (currentPage === "curriculum-submit") {
        renderCurriculumSubmitPage();
      }
    });

    return;
  }

  pageContent.innerHTML = renderCard("ไม่พบหน้า", "ไม่พบข้อมูลหน้าที่ต้องการ");
}

function setActiveMenu(page) {
  const menuButtons = document.querySelectorAll("#menu-list .menu-item");
  menuButtons.forEach((button) => {
    if (button.dataset.page === page) {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
    }
  });
}

function navigateToPage(page) {
  if (!canAccessPage(page, currentUser)) {
    console.warn("Access denied:", page);
    const defaultPage = getDefaultPageForRole(currentUser ? normalizeRole(currentUser.role) : null);
    if (defaultPage && defaultPage !== page) {
      navigateToPage(defaultPage);
    } else {
      renderForbiddenPage();
    }
    return;
  }
  if (page !== "dashboard") {
    stopDashboardAutoRefresh();
  }
  currentPage = page;
  setActiveMenu(page);
  renderPage(page);
}

function fillProfile(user) {
  const roleLabel = ROLE_LABELS[user.role] || user.role;

  document.getElementById("profile-name").textContent = user.name;
  document.getElementById("profile-role").textContent = `สิทธิ์: ${roleLabel}`;
  document.getElementById("profile-school").textContent = `สังกัด: ${user.areaService}`;
}

function setupSidebarToggle() {
  const sidebar = document.getElementById("sidebar");
  const toggleButton = document.getElementById("toggle-sidebar");
  const toggleIcon = document.getElementById("toggle-icon");

  let isCollapsed = false;

  toggleButton.addEventListener("click", () => {
    isCollapsed = !isCollapsed;
    sidebar.classList.toggle("is-collapsed", isCollapsed);
    toggleIcon.textContent = isCollapsed ? "⟩⟩" : "⟨⟨";
  });
}

function setupLogout() {
  const logoutButton = document.getElementById("logout-btn");
  logoutButton.addEventListener("click", () => {
    clearSession();
    redirectToLogin("logout");
  });
}

function initDashboard() {
  const user = getSessionUser();

  if (!user) {
    redirectToLogin(sessionValidationReason === "expired" ? "expired" : "missing");
    return;
  }

  currentUser = user;
  fillProfile(user);
  renderMenu(user.role);
  navigateToPage(currentPage);
  setupSidebarToggle();
  setupLogout();
}

initDashboard();
