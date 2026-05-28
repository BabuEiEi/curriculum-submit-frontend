function callSupabase(endpoint, method = "GET", payload = null) {
  const config = getSystemConfigs();

  const url = config.SUPABASE_URL + "/rest/v1/" + endpoint;

  const options = {
    method: method,
    headers: {
      apikey: config.SUPABASE_KEY,
      Authorization: "Bearer " + config.SUPABASE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    muteHttpExceptions: true
  };

  if (payload) {
    options.payload = JSON.stringify(payload);
  }

  const response = UrlFetchApp.fetch(url, options);
  const text = response.getContentText();

  if (!text) {
    return {
      success: true,
      message: "No content returned"
    };
  }

  return JSON.parse(text);
}

function upsertSupabase(endpoint, payload) {
  const config = getSystemConfigs();
  const url = config.SUPABASE_URL + "/rest/v1/" + endpoint;

  const options = {
    method: "POST",
    headers: {
      apikey: config.SUPABASE_KEY,
      Authorization: "Bearer " + config.SUPABASE_KEY,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const text = response.getContentText();

  if (!text) {
    return {
      success: true,
      message: "No content returned"
    };
  }

  return JSON.parse(text);
}

function normalizeRole(roleValue) {
  const role = String(roleValue || "").trim().toLowerCase();
  return ["admin", "staff", "school"].indexOf(role) !== -1 ? role : "";
}

function getUserByCode(userCode) {
  const normalizedCode = String(userCode || "").trim();
  if (!normalizedCode) {
    return null;
  }

  const rows = callSupabase(
    "users?select=id,user_code,name,role,is_active&user_code=eq." + encodeURIComponent(normalizedCode) + "&limit=1"
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  return rows[0];
}

function requireAuth(data) {
  const requesterUserCode = String((data && data.requesterUserCode) || "").trim();
  const requesterRole = normalizeRole(data && data.requesterRole);

  if (!requesterUserCode) {
    return { success: false, message: "กรุณาระบุ requesterUserCode" };
  }

  if (!requesterRole) {
    return { success: false, message: "กรุณาระบุ requesterRole ที่ถูกต้อง" };
  }

  const requester = getUserByCode(requesterUserCode);
  if (!requester) {
    return { success: false, message: "ไม่พบผู้ใช้งาน requester" };
  }

  if (!requester.is_active) {
    return { success: false, message: "บัญชีผู้ใช้งานถูกปิดใช้งาน" };
  }

  const dbRole = normalizeRole(requester.role);
  if (!dbRole) {
    return { success: false, message: "ไม่สามารถยืนยันสิทธิ์ผู้ใช้งานได้" };
  }

  if (dbRole !== requesterRole) {
    return { success: false, message: "ข้อมูลสิทธิ์ไม่ตรงกับระบบ" };
  }

  return {
    success: true,
    requester: {
      userCode: requester.user_code,
      role: dbRole,
      name: requester.name || "",
    },
  };
}

function requireRole(authResult, allowedRoles) {
  if (!authResult || authResult.success !== true || !authResult.requester) {
    return { success: false, message: "ไม่สามารถตรวจสอบสิทธิ์ผู้ใช้งานได้" };
  }

  const roles = Array.isArray(allowedRoles) ? allowedRoles.map(normalizeRole).filter(Boolean) : [];
  if (roles.length === 0) {
    return { success: false, message: "ยังไม่ได้กำหนดสิทธิ์สำหรับ action นี้" };
  }

  if (roles.indexOf(authResult.requester.role) === -1) {
    return { success: false, message: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" };
  }

  return { success: true };
}

function toSchoolProfileData(row, source) {
  const current = row || {};

  return {
    userCode: current.userCode || current.user_code || "",
    schoolName: current.schoolName || current.school_name || current.name || "",
    address: current.address || "",
    contactName: current.contactName || current.contact_name || "",
    phone: current.phone || "",
    areaService: current.areaService || current.area_service || "",
    email: current.email || "",
    source: source || current.source || "schools"
  };
}

function getSchoolFallbackUser(userCode) {
  const normalizedCode = String(userCode || "").trim();
  if (!normalizedCode) {
    return null;
  }

  const rows = callSupabase(
    "users?select=user_code,name,school_name,area_service,email,role,is_active&user_code=eq."
    + encodeURIComponent(normalizedCode)
    + "&role=eq.school&limit=1"
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  return rows[0];
}

function getSchoolProfile(data, requester) {
  if (!data || data.action !== "getSchoolProfile") {
    return { success: false, message: "action ไม่ถูกต้อง" };
  }

  const requesterRole = normalizeRole(requester && requester.role);
  const requesterUserCode = String((requester && requester.userCode) || "").trim();
  let targetUserCode = requesterUserCode;

  if (requesterRole === "admin" || requesterRole === "staff") {
    targetUserCode = String(data.userCode || requesterUserCode || "").trim();
  }

  if (!targetUserCode) {
    return { success: false, message: "ไม่พบรหัสโรงเรียนที่ต้องการ" };
  }

  if (requesterRole === "school" && targetUserCode !== requesterUserCode) {
    return { success: false, message: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" };
  }

  const schoolRows = callSupabase(
    "schools?select=*&user_code=eq."
    + encodeURIComponent(targetUserCode)
    + "&limit=1"
  );

  if (Array.isArray(schoolRows) && schoolRows.length > 0) {
    return {
      success: true,
      data: toSchoolProfileData(schoolRows[0], "schools")
    };
  }

  const fallbackUser = getSchoolFallbackUser(targetUserCode);
  if (fallbackUser) {
    return {
      success: true,
      data: toSchoolProfileData({
        user_code: fallbackUser.user_code,
        school_name: fallbackUser.school_name || fallbackUser.name || "",
        address: "",
        contact_name: "",
        phone: "",
        area_service: fallbackUser.area_service || "",
        email: fallbackUser.email || ""
      }, "users_fallback")
    };
  }

  return { success: false, message: "ไม่พบข้อมูลโรงเรียนในระบบ" };
}

function removeMissingColumnFromPayload(payload, errorMessage) {
  const message = String(errorMessage || "");
  const match = message.match(/Could not find the '([^']+)' column/i);
  if (!match || !match[1]) {
    return false;
  }

  const missingColumn = String(match[1]).trim();
  if (!missingColumn || !Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
    return false;
  }

  delete payload[missingColumn];
  return true;
}

function upsertSchoolProfileWithSchemaFallback(payload) {
  const mutablePayload = Object.assign({}, payload);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const result = upsertSupabase("schools?on_conflict=user_code", mutablePayload);

    if (!result || Array.isArray(result) || !result.code) {
      return { success: true, result: result };
    }

    const removed = removeMissingColumnFromPayload(mutablePayload, result.message || result.details || "");
    if (!removed) {
      return { success: false, result: result };
    }
  }

  return {
    success: false,
    result: {
      code: "SCHOOLS_SCHEMA_MISMATCH",
      message: "โครงสร้างตาราง schools ไม่ตรงกับข้อมูลที่ต้องบันทึก"
    }
  };
}

function updateSchoolProfile(data, requester) {
  if (!data || data.action !== "updateSchoolProfile") {
    return { success: false, message: "action ไม่ถูกต้อง" };
  }

  const requesterRole = normalizeRole(requester && requester.role);
  const requesterUserCode = String((requester && requester.userCode) || "").trim();
  const incomingUserCode = String(data.userCode || "").trim();
  let targetUserCode = requesterUserCode;

  if (requesterRole === "school") {
    if (incomingUserCode && incomingUserCode !== requesterUserCode) {
      return { success: false, message: "ไม่มีสิทธิ์แก้ไขข้อมูลของโรงเรียนอื่น" };
    }
  } else if (requesterRole === "admin") {
    targetUserCode = incomingUserCode || requesterUserCode;
  } else {
    return { success: false, message: "ไม่มีสิทธิ์แก้ไขข้อมูลนี้" };
  }

  if (!targetUserCode) {
    return { success: false, message: "ไม่พบรหัสโรงเรียนที่ต้องการบันทึก" };
  }

  const schoolName = String(data.schoolName || "").trim();
  const address = String(data.address || "").trim();
  const contactName = String(data.contactName || "").trim();
  const phone = String(data.phone || "").trim();
  const phonePattern = /^[0-9+\-\s]*$/;

  if (!schoolName) {
    return { success: false, message: "กรุณาระบุชื่อโรงเรียน" };
  }

  if (phone && !phonePattern.test(phone)) {
    return { success: false, message: "รูปแบบเบอร์โทรไม่ถูกต้อง" };
  }

  const fallbackUser = getSchoolFallbackUser(targetUserCode);
  if (!fallbackUser) {
    return { success: false, message: "ไม่พบบัญชีโรงเรียนสำหรับบันทึกข้อมูล" };
  }

  const payload = {
    user_code: targetUserCode,
    school_name: schoolName,
    address: address,
    contact_name: contactName,
    phone: phone,
    area_service: String(data.areaService || fallbackUser.area_service || "").trim(),
    email: String(data.email || fallbackUser.email || "").trim(),
    updated_at: new Date().toISOString()
  };

  const upsertResponse = upsertSchoolProfileWithSchemaFallback(payload);
  const upsertResult = upsertResponse.result;

  if (!upsertResponse.success && upsertResult && !Array.isArray(upsertResult) && upsertResult.code) {
    const errorMessage = String(upsertResult.message || "").trim();
    const normalizedMessage = errorMessage.toLowerCase();
    if (normalizedMessage.indexOf("on_conflict") !== -1 || normalizedMessage.indexOf("unique") !== -1) {
      return {
        success: false,
        message: "ไม่สามารถบันทึกข้อมูลโรงเรียนได้ อาจต้องเพิ่ม unique constraint ที่ user_code ในตาราง schools ก่อน"
      };
    }

    return {
      success: false,
      message: errorMessage || "ไม่สามารถบันทึกข้อมูลโรงเรียนได้"
    };
  }

  const latestProfile = getSchoolProfile({ action: "getSchoolProfile", userCode: targetUserCode }, requester);
  if (!latestProfile.success) {
    return latestProfile;
  }

  return {
    success: true,
    message: "บันทึกข้อมูลโรงเรียนสำเร็จ",
    data: latestProfile.data
  };
}

function handleLogin(data) {
  const username = encodeURIComponent(data.username);

  const endpoint =
    `users?or=(email.eq.${username},user_code.eq.${username})&select=*`;

  const users = callSupabase(endpoint);

  if (!users || users.length === 0) {
    return {
      success: false,
      message: "ไม่พบผู้ใช้งาน"
    };
  }

  const user = users[0];

  if (!user.is_active) {
    return {
      success: false,
      message: "บัญชีถูกปิดใช้งาน"
    };
  }

  if (user.password_hash != data.password) {
    return {
      success: false,
      message: "รหัสผ่านไม่ถูกต้อง"
    };
  }

  return {
    success: true,
    user: {
      userCode: user.user_code,
      name: user.name,
      areaService: user.area_service,
      school: user.school_name,
      role: user.role
    }
  };
}

function getUsers() {
  return callSupabase(
    "users?select=id,user_code,name,school_name,area_service,email,role,is_active,created_at&order=id.asc"
  );
}

function createUser(data) {
  const userCode = String(data.userCode || "").trim();
  const name = String(data.name || "").trim();
  const schoolName = String(data.schoolName || "").trim();
  const areaService = String(data.areaService || "").trim();
  const email = String(data.email || "").trim();
  const password = String(data.password || "").trim();
  const role = String(data.role || "").trim();

  if (!userCode) {
    return { success: false, message: "userCode ห้ามว่าง" };
  }

  if (!name) {
    return { success: false, message: "name ห้ามว่าง" };
  }

  if (!email) {
    return { success: false, message: "email ห้ามว่าง" };
  }

  if (!password) {
    return { success: false, message: "password ห้ามว่าง" };
  }

  if (!role) {
    return { success: false, message: "role ห้ามว่าง" };
  }

  const payload = {
    user_code: userCode,
    name: name,
    school_name: schoolName,
    area_service: areaService,
    email: email,
    password_hash: password,
    role: role,
    is_active: Boolean(data.isActive)
  };

  const result = callSupabase("users", "POST", payload);

  return {
    success: true,
    message: "สร้างผู้ใช้งานสำเร็จ",
    data: result
  };
}

function updateUser(data) {
  const id = data.id;
  const name = String(data.name || "").trim();
  const schoolName = String(data.schoolName || "").trim();
  const areaService = String(data.areaService || "").trim();
  const email = String(data.email || "").trim();
  const role = String(data.role || "").trim();

  if (!id) {
    return { success: false, message: "id ต้องมี" };
  }

  if (!name) {
    return { success: false, message: "name ห้ามว่าง" };
  }

  if (!email) {
    return { success: false, message: "email ห้ามว่าง" };
  }

  const payload = {
    name: name,
    school_name: schoolName,
    area_service: areaService,
    email: email,
    role: role,
    is_active: Boolean(data.isActive)
  };

  const endpoint = "users?id=eq." + encodeURIComponent(id);
  const result = callSupabase(endpoint, "PATCH", payload);

  return {
    success: true,
    message: "อัปเดตผู้ใช้งานสำเร็จ",
    data: result
  };
}

function deleteUser(data) {
  const id = data.id;

  if (!id) {
    return { success: false, message: "id ต้องมี" };
  }

  const endpoint = "users?id=eq." + encodeURIComponent(id);
  callSupabase(endpoint, "DELETE", null);

  return {
    success: true,
    message: "ลบผู้ใช้งานสำเร็จ"
  };
}

function importUsers(data) {
  const users = data.users;

  if (!Array.isArray(users) || users.length === 0) {
    return { success: false, message: "users ต้องเป็น array และต้องมีข้อมูล" };
  }

  const validRoles = ["admin", "staff", "school"];
  const payload = [];

  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    const userCode = String(u.userCode || "").trim();
    const name = String(u.name || "").trim();
    const email = String(u.email || "").trim();
    const password = String(u.password || "").trim();
    const role = String(u.role || "").trim();

    if (!userCode) {
      return { success: false, message: "รายการที่ " + (i + 1) + ": userCode ห้ามว่าง" };
    }
    if (!name) {
      return { success: false, message: "รายการที่ " + (i + 1) + ": name ห้ามว่าง" };
    }
    if (!email) {
      return { success: false, message: "รายการที่ " + (i + 1) + ": email ห้ามว่าง" };
    }
    if (!password) {
      return { success: false, message: "รายการที่ " + (i + 1) + ": password ห้ามว่าง" };
    }
    if (!role || validRoles.indexOf(role) === -1) {
      return { success: false, message: "รายการที่ " + (i + 1) + ": role ต้องเป็น admin, staff หรือ school" };
    }

    payload.push({
      user_code: userCode,
      name: name,
      school_name: String(u.schoolName || "").trim(),
      area_service: String(u.areaService || "").trim(),
      email: email,
      password_hash: password,
      role: role,
      is_active: Boolean(u.isActive)
    });
  }

  const result = callSupabase("users", "POST", payload);

  return {
    success: true,
    message: "นำเข้าข้อมูลสำเร็จ",
    count: payload.length,
    data: result
  };
}

function getSchools(data) {
  if (!data || data.action !== "getSchools") {
    return { success: false, message: "action ไม่ถูกต้อง" };
  }

  const result = callSupabase(
    "users?select=id,user_code,name,school_name,area_service,email,is_active&role=eq.school&order=id.asc"
  );

  if (!Array.isArray(result)) {
    return {
      success: false,
      message: "ไม่สามารถโหลดข้อมูลโรงเรียนได้",
      data: []
    };
  }

  return {
    success: true,
    data: result
  };
}

function getSubmissionStatus(data, requester) {
  if (!data || data.action !== "getSubmissionStatus") {
    return { success: false, message: "action ไม่ถูกต้อง" };
  }

  const schools = callSupabase(
    "users?select=user_code,school_name,area_service,role&role=eq.school&order=user_code.asc"
  );

  if (!Array.isArray(schools)) {
    return {
      success: false,
      message: "ไม่สามารถโหลดข้อมูลโรงเรียนได้",
      data: []
    };
  }

  const submissions = callSupabase(
    "submissions?select=user_code,early_file,lower_file,upper_file,early_status,lower_status,upper_status,submitted_at&order=user_code.asc,submitted_at.desc"
  );

  if (!Array.isArray(submissions)) {
    return {
      success: false,
      message: "ไม่สามารถโหลดข้อมูลการส่งงานได้",
      data: []
    };
  }

  const latestSubmissionByUserCode = {};
  submissions.forEach((item) => {
    const userCode = String(item.user_code || "").trim();
    if (!userCode) {
      return;
    }

    if (!latestSubmissionByUserCode[userCode]) {
      latestSubmissionByUserCode[userCode] = item;
    }
  });

  let dataRows = schools
    .filter((school) => String(school.role || "").trim().toLowerCase() === "school")
    .map((school) => {
      const userCode = String(school.user_code || "").trim();
      const submission = latestSubmissionByUserCode[userCode] || {};

      const hasEarly = Boolean(submission.early_file);
      const hasLower = Boolean(submission.lower_file);
      const hasUpper = Boolean(submission.upper_file);

      let overallStatus = "ส่งแล้ว";
      if (hasEarly && hasLower && hasUpper) {
        overallStatus = "ส่งครบ";
      } else if (!hasEarly && !hasLower && !hasUpper) {
        overallStatus = "ยังไม่ส่ง";
      } else if (hasUpper) {
        overallStatus = "ส่งแล้ว";
      }

      return {
        user_code: userCode,
        school_name: school.school_name || "",
        area_service: school.area_service || "",
        early_file: submission.early_file || null,
        lower_file: submission.lower_file || null,
        upper_file: submission.upper_file || null,
        early_status: submission.early_status || (hasEarly ? "ส่งแล้ว" : "ยังไม่ส่ง"),
        lower_status: submission.lower_status || (hasLower ? "ส่งแล้ว" : "ยังไม่ส่ง"),
        upper_status: submission.upper_status || (hasUpper ? "ส่งแล้ว" : "ยังไม่ส่ง"),
        submitted_at: submission.submitted_at || null,
        overall_status: overallStatus
      };
    });

  if (requester && requester.role === "school") {
    dataRows = dataRows.filter((row) => String(row.user_code || "").trim() === String(requester.userCode || "").trim());
  }

  return {
    success: true,
    data: dataRows
  };
}

function uploadSubmission(data, requester) {
  const userCode = String(data.userCode || "").trim();
  const schoolName = String(data.schoolName || "").trim();
  const files = data.files || {};

  if (!requester || normalizeRole(requester.role) !== "school") {
    return { success: false, message: "ไม่มีสิทธิ์ส่งงาน" };
  }

  if (String(requester.userCode || "").trim() !== userCode) {
    return { success: false, message: "ไม่มีสิทธิ์ส่งงานแทนผู้อื่น" };
  }

  if (!userCode) {
    return { success: false, message: "userCode ห้ามว่าง" };
  }

  if (!schoolName) {
    return { success: false, message: "schoolName ห้ามว่าง" };
  }

  if (!files.upper || !files.upper.base64) {
    return { success: false, message: "files.upper ต้องมี" };
  }

  const config = getSystemConfigs();
  const maxSize = Number(config.MAX_FILE_SIZE);
  const incomingFiles = {
    early: files.early,
    lower: files.lower,
    upper: files.upper
  };

  const uploaded = {
    early: null,
    lower: null,
    upper: null
  };

  const fileKeys = ["early", "lower", "upper"];
  for (let i = 0; i < fileKeys.length; i++) {
    const key = fileKeys[i];
    const current = incomingFiles[key];
    if (!current || !current.base64) {
      continue;
    }

    const mimeType = String(current.mimeType || "").trim().toLowerCase();
    if (mimeType !== "application/pdf") {
      return { success: false, message: "ทุกไฟล์ต้องเป็น application/pdf" };
    }

    const bytes = Utilities.base64Decode(String(current.base64));
    if (bytes.length > maxSize) {
      return { success: false, message: "ไฟล์เกิน 5 MB" };
    }

    uploaded[key] = saveSubmissionPdfFile(current, key, userCode, schoolName);
  }

  const existingRows = callSupabase(
    "submissions?select=id,user_code,school_name,early_file,lower_file,upper_file,early_status,lower_status,upper_status,submitted_at,updated_at&user_code=eq."
    + encodeURIComponent(userCode)
    + "&order=updated_at.desc&limit=1"
  );

  const hasExisting = Array.isArray(existingRows) && existingRows.length > 0;
  const existing = hasExisting ? existingRows[0] : null;

  const earlyFile = uploaded.early ? uploaded.early.url : (existing ? existing.early_file : null);
  const lowerFile = uploaded.lower ? uploaded.lower.url : (existing ? existing.lower_file : null);
  const upperFile = uploaded.upper ? uploaded.upper.url : (existing ? existing.upper_file : null);

  const now = new Date().toISOString();
  const payload = {
    user_code: userCode,
    school_name: schoolName,
    early_file: earlyFile,
    lower_file: lowerFile,
    upper_file: upperFile,
    early_status: earlyFile ? "ส่งแล้ว" : "ยังไม่ส่ง",
    lower_status: lowerFile ? "ส่งแล้ว" : "ยังไม่ส่ง",
    upper_status: upperFile ? "ส่งแล้ว" : "ยังไม่ส่ง",
    submitted_at: now,
    updated_at: now
  };

  let result;
  if (hasExisting && existing.id) {
    result = callSupabase("submissions?id=eq." + encodeURIComponent(existing.id), "PATCH", payload);
  } else {
    result = callSupabase("submissions", "POST", payload);
  }

  return {
    success: true,
    message: "ส่งงานสำเร็จ",
    data: {
      uploaded: {
        early: uploaded.early,
        lower: uploaded.lower,
        upper: uploaded.upper
      },
      submission: result
    }
  };
}

function getSubmissionDetail(data, requester) {
  if (!data || data.action !== "getSubmissionDetail") {
    return { success: false, message: "action ไม่ถูกต้อง" };
  }

  const requesterRole = normalizeRole(requester && requester.role);
  const requesterUserCode = String((requester && requester.userCode) || "").trim();
  const userCode = String(data.userCode || requesterUserCode || "").trim();

  if (!userCode) {
    return { success: false, message: "userCode ห้ามว่าง" };
  }

  if (requesterRole === "school") {
    if (!requesterUserCode || requesterUserCode !== userCode) {
      return { success: false, message: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" };
    }
  }

  const rows = callSupabase(
    "submissions?select=user_code,school_name,early_file,lower_file,upper_file,submitted_at,updated_at&user_code=eq."
    + encodeURIComponent(userCode)
    + "&order=updated_at.desc&limit=1"
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return { success: false, message: "ไม่พบข้อมูลการส่งงาน" };
  }

  const row = rows[0];
  const earlyFileUrl = row.early_file || null;
  const lowerFileUrl = row.lower_file || null;
  const upperFileUrl = row.upper_file || null;

  const sentCount = [earlyFileUrl, lowerFileUrl, upperFileUrl].filter(Boolean).length;
  let overallStatus = "ยังไม่ส่ง";
  if (sentCount === 3) {
    overallStatus = "ส่งครบ";
  } else if (sentCount > 0) {
    overallStatus = "ส่งบางส่วน";
  }

  return {
    success: true,
    data: {
      schoolName: row.school_name || "",
      overallStatus: overallStatus,
      uploadedAt: row.submitted_at || null,
      updatedAt: row.updated_at || null,
      earlyFileUrl: earlyFileUrl,
      lowerFileUrl: lowerFileUrl,
      upperFileUrl: upperFileUrl,
      earlyFileName: extractFileNameFromUrl(earlyFileUrl),
      lowerFileName: extractFileNameFromUrl(lowerFileUrl),
      upperFileName: extractFileNameFromUrl(upperFileUrl)
    }
  };
}

function getDashboardStats(data) {
  if (!data || data.action !== "getDashboardStats") {
    return { success: false, message: "action ไม่ถูกต้อง" };
  }

  const schools = callSupabase(
    "users?select=user_code,role&role=eq.school&order=user_code.asc"
  );

  if (!Array.isArray(schools)) {
    return {
      success: false,
      message: "ไม่สามารถโหลดข้อมูลโรงเรียนได้"
    };
  }

  const submissions = callSupabase(
    "submissions?select=user_code,early_file,lower_file,upper_file,updated_at&order=user_code.asc,updated_at.desc"
  );

  if (!Array.isArray(submissions)) {
    return {
      success: false,
      message: "ไม่สามารถโหลดข้อมูลการส่งงานได้"
    };
  }

  const latestSubmissionByUserCode = {};
  submissions.forEach((item) => {
    const userCode = String(item.user_code || "").trim();
    if (!userCode) {
      return;
    }

    if (!latestSubmissionByUserCode[userCode]) {
      latestSubmissionByUserCode[userCode] = item;
    }
  });

  const stats = {
    totalSchools: schools.length,
    completedSchools: 0,
    partialSchools: 0,
    notSubmittedSchools: 0,
    earlySubmittedCount: 0,
    lowerSubmittedCount: 0,
    upperSubmittedCount: 0
  };

  schools.forEach((school) => {
    const userCode = String(school.user_code || "").trim();
    const submission = latestSubmissionByUserCode[userCode] || {};

    const hasEarly = Boolean(submission.early_file);
    const hasLower = Boolean(submission.lower_file);
    const hasUpper = Boolean(submission.upper_file);
    const submittedCount = [hasEarly, hasLower, hasUpper].filter(Boolean).length;

    if (hasEarly) {
      stats.earlySubmittedCount += 1;
    }
    if (hasLower) {
      stats.lowerSubmittedCount += 1;
    }
    if (hasUpper) {
      stats.upperSubmittedCount += 1;
    }

    if (submittedCount === 3) {
      stats.completedSchools += 1;
    } else if (submittedCount === 0) {
      stats.notSubmittedSchools += 1;
    } else {
      stats.partialSchools += 1;
    }
  });

  return {
    success: true,
    data: stats
  };
}

function extractFileNameFromUrl(url) {
  if (!url) {
    return "";
  }

  const fileIdMatch = String(url).match(/\/d\/([^/]+)/);
  if (fileIdMatch && fileIdMatch[1]) {
    try {
      return DriveApp.getFileById(fileIdMatch[1]).getName();
    } catch (error) {
      // Fall back to URL parsing when Drive lookup fails.
    }
  }

  const cleanUrl = String(url).split("?")[0];
  const parts = cleanUrl.split("/");
  const encodedName = parts[parts.length - 1] || "";
  try {
    return decodeURIComponent(encodedName);
  } catch (error) {
    return encodedName;
  }
}

function saveSubmission(data) {
  const payload = {
    user_code: data.userCode,
    school_name: data.schoolName,
    early_file: data.earlyFile || null,
    lower_file: data.lowerFile || null,
    upper_file: data.upperFile || null,
    early_status: data.earlyFile ? "ส่งแล้ว" : "ยังไม่ส่ง",
    lower_status: data.lowerFile ? "ส่งแล้ว" : "ยังไม่ส่ง",
    upper_status: data.upperFile ? "ส่งแล้ว" : "ยังไม่ส่ง",
    updated_at: new Date().toISOString()
  };

  const endpoint = "submissions";

  return callSupabase(endpoint, "POST", payload);
}