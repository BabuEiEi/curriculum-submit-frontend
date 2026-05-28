function saveFileToDrive(base64Data, fileName, curriculumType) {

  const config = getSystemConfigs();

  let folderId = "";

  switch (curriculumType) {

    case "early":
      folderId = config.EARLY_FOLDER_ID;
      break;

    case "lower":
      folderId = config.LOWER_FOLDER_ID;
      break;

    case "upper":
      folderId = config.UPPER_FOLDER_ID;
      break;

    default:
      throw new Error("ไม่พบประเภทหลักสูตร");
  }


  const bytes = Utilities.base64Decode(base64Data);

  const blob =
    Utilities.newBlob(
      bytes,
      "application/pdf",
      fileName
    );

  const maxSize =
    Number(config.MAX_FILE_SIZE);

  if (blob.getBytes().length > maxSize) {

    throw new Error(
      "ไฟล์เกิน 5 MB"
    );

  }

  const folder =
    DriveApp.getFolderById(folderId);

  const file =
    folder.createFile(blob);

  return {

    success: true,

    fileId: file.getId(),

    fileName: file.getName(),

    url: file.getUrl()

  };

}

function sanitizeFileNamePart(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getSubmissionFileDisplayName(userCode, fallbackSchoolName) {
  const normalizedUserCode = sanitizeFileNamePart(userCode);
  if (!normalizedUserCode) {
    throw new Error("userCode ห้ามว่าง");
  }

  const rows = callSupabase(
    "users?select=school_name,name&user_code=eq." + encodeURIComponent(normalizedUserCode) + "&limit=1"
  );

  if (Array.isArray(rows) && rows.length > 0) {
    const row = rows[0] || {};
    const schoolName = sanitizeFileNamePart(row.school_name || "");
    if (schoolName) {
      return schoolName;
    }

    const name = sanitizeFileNamePart(row.name || "");
    if (name) {
      return name;
    }
  }

  const fallbackName = sanitizeFileNamePart(fallbackSchoolName || "");
  if (fallbackName) {
    return fallbackName;
  }

  return normalizedUserCode;
}

function buildSubmissionFileName(userCode, schoolName, curriculumType) {
  const suffixMap = {
    early: "ปฐมวัย",
    lower: "ประถมต้น",
    upper: "ประถมปลาย"
  };

  const suffix = suffixMap[curriculumType];
  if (!suffix) {
    throw new Error("ไม่พบประเภทหลักสูตร");
  }

  const safeUserCode = sanitizeFileNamePart(userCode);
  const safeDisplayName = sanitizeFileNamePart(schoolName);

  if (!safeUserCode) {
    throw new Error("userCode ห้ามว่าง");
  }

  if (!safeDisplayName) {
    throw new Error("name ห้ามว่าง");
  }

  return `${safeUserCode}_${safeDisplayName}_${suffix}.pdf`;
}

function saveSubmissionPdfFile(fileData, curriculumType, userCode, schoolName) {
  if (!fileData || !fileData.base64) {
    return null;
  }

  const mimeType = String(fileData.mimeType || "").trim().toLowerCase();
  if (mimeType !== "application/pdf") {
    throw new Error("รองรับเฉพาะไฟล์ PDF");
  }

  const resolvedSchoolName = getSubmissionFileDisplayName(userCode, schoolName);
  const fileName = buildSubmissionFileName(userCode, resolvedSchoolName, curriculumType);
  return saveFileToDrive(fileData.base64, fileName, curriculumType);
}