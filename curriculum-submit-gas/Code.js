function doGet(e) {
  return jsonResponse({
    success: true,
    system: "CurriculumSubmitAPI",
    version: "1.0",
    status: "running",
    timestamp: new Date()
  });
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    const adminOnlyActions = ["getUsers", "createUser", "updateUser", "deleteUser", "importUsers"];
    const adminStaffActions = ["getSchools", "getDashboardStats"];

    let result;

    if (action === "login") {
      result = handleLogin(data);
    } else if (action === "getSchoolProfile") {
      const authResult = requireAuth(data);
      if (!authResult.success) {
        return jsonResponse(authResult);
      }

      const roleResult = requireRole(authResult, ["admin", "staff", "school"]);
      if (!roleResult.success) {
        return jsonResponse(roleResult);
      }

      result = getSchoolProfile(data, authResult.requester);
    } else if (action === "updateSchoolProfile") {
      const authResult = requireAuth(data);
      if (!authResult.success) {
        return jsonResponse(authResult);
      }

      const roleResult = requireRole(authResult, ["admin", "school"]);
      if (!roleResult.success) {
        return jsonResponse(roleResult);
      }

      result = updateSchoolProfile(data, authResult.requester);
    } else if (adminOnlyActions.indexOf(action) !== -1) {
      const authResult = requireAuth(data);
      if (!authResult.success) {
        return jsonResponse(authResult);
      }

      const roleResult = requireRole(authResult, ["admin"]);
      if (!roleResult.success) {
        return jsonResponse(roleResult);
      }

      if (action === "getUsers") {
        result = getUsers();
      } else if (action === "createUser") {
        result = createUser(data);
      } else if (action === "updateUser") {
        result = updateUser(data);
      } else if (action === "deleteUser") {
        result = deleteUser(data);
      } else if (action === "importUsers") {
        result = importUsers(data);
      }
    } else if (adminStaffActions.indexOf(action) !== -1) {
      const authResult = requireAuth(data);
      if (!authResult.success) {
        return jsonResponse(authResult);
      }

      const roleResult = requireRole(authResult, ["admin", "staff"]);
      if (!roleResult.success) {
        return jsonResponse(roleResult);
      }

      if (action === "getSchools") {
        result = getSchools(data);
      } else if (action === "getDashboardStats") {
        result = getDashboardStats(data);
      }
    } else if (action === "getSubmissionStatus") {
      const authResult = requireAuth(data);
      if (!authResult.success) {
        return jsonResponse(authResult);
      }

      const requesterRole = authResult.requester.role;
      const roleResult = requesterRole === "school"
        ? requireRole(authResult, ["school"])
        : requireRole(authResult, ["admin", "staff"]);
      if (!roleResult.success) {
        return jsonResponse(roleResult);
      }

      result = getSubmissionStatus(data, authResult.requester);
    } else if (action === "uploadSubmission") {
      const authResult = requireAuth(data);
      if (!authResult.success) {
        return jsonResponse(authResult);
      }

      const roleResult = requireRole(authResult, ["school"]);
      if (!roleResult.success) {
        return jsonResponse(roleResult);
      }

      result = uploadSubmission(data, authResult.requester);
    } else if (action === "getSubmissionDetail") {
      const authResult = requireAuth(data);
      if (!authResult.success) {
        return jsonResponse(authResult);
      }

      const roleResult = requireRole(authResult, ["admin", "staff", "school"]);
      if (!roleResult.success) {
        return jsonResponse(roleResult);
      }

      result = getSubmissionDetail(data, authResult.requester);
    } else {
      result = {
        success: false,
        message: "ไม่พบ action ที่ระบุ"
      };
    }

    return jsonResponse(result);

  } catch (error) {
    return jsonResponse({
      success: false,
      message: "เกิดข้อผิดพลาดในระบบ",
      error: error.toString()
    });
  }
}

function testImportUsers() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        action: "importUsers",
        users: [
          {
            userCode: "staff002",
            name: "เจ้าหน้าที่ทดสอบ 2",
            schoolName: "",
            areaService: "สพม.พิษณุโลก อุตรดิตถ์",
            email: "staff002@test.com",
            password: "123456",
            role: "staff",
            isActive: true
          },
          {
            userCode: "school002",
            name: "โรงเรียนทดสอบ 2",
            schoolName: "โรงเรียนทดสอบ",
            areaService: "สพม.พิษณุโลก อุตรดิตถ์",
            email: "school002@test.com",
            password: "123456",
            role: "school",
            isActive: true
          }
        ]
      })
    }
  };

  const response = doPost(mockEvent);
  Logger.log(response.getContent());
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function testDoPostLogin() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        action: "login",
        username: "admin001",
        password: "123456"
      })
    }
  };

  const response = doPost(mockEvent);

  Logger.log(response.getContent());
}

function testGetUsers() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        action: "getUsers",
        requesterUserCode: "admin001",
        requesterRole: "admin"
      })
    }
  };

  const response = doPost(mockEvent);
  Logger.log(response.getContent());
}

function testGetSchools() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        action: "getSchools",
        requesterUserCode: "staff001",
        requesterRole: "staff"
      })
    }
  };

  const response = doPost(mockEvent);
  Logger.log(response.getContent());
}

function testGetSubmissionStatus() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        action: "getSubmissionStatus",
        requesterUserCode: "school002",
        requesterRole: "school"
      })
    }
  };

  const response = doPost(mockEvent);
  Logger.log(response.getContent());
}

function testUploadSubmission() {
  const fakePdfBase64 = "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFsgMyAwIFIgXSAvQ291bnQgMSA+PgplbmRvYmoKMyAwIG9iago8PCAvVHlwZSAvUGFnZSAvUGFyZW50IDIgMCBSIC9NZWRpYUJveCBbMCAwIDMwMCAxNDRdIC9Db250ZW50cyA0IDAgUiA+PgplbmRvYmoKNCAwIG9iago8PCAvTGVuZ3RoIDQ0ID4+CnN0cmVhbQpCVAovRjEgMTIgVGYKMTAwIDEwMCBUZAooSGVsbG8gUERGKSBUagpFVAplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA1CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxMCAwMDAwMCBuIAowMDAwMDAwMDYwIDAwMDAwIG4gCjAwMDAwMDAxMTcgMDAwMDAgbiAKMDAwMDAwMDIxMiAwMDAwMCBuIAp0cmFpbGVyCjw8IC9Sb290IDEgMCBSIC9TaXplIDUgPj4Kc3RhcnR4cmVmCjMwNQolJUVPRg==";

  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        action: "uploadSubmission",
        userCode: "school002",
        schoolName: "โรงเรียนทดสอบ",
        requesterUserCode: "school002",
        requesterRole: "school",
        files: {
          upper: {
            fileName: "upper.pdf",
            mimeType: "application/pdf",
            base64: fakePdfBase64
          }
        }
      })
    }
  };

  const response = doPost(mockEvent);
  Logger.log(response.getContent());
}

function testGetSubmissionDetail() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        action: "getSubmissionDetail",
        userCode: "school002",
        requesterUserCode: "admin001",
        requesterRole: "admin"
      })
    }
  };

  const response = doPost(mockEvent);
  Logger.log(response.getContent());
}

function testGetDashboardStats() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        action: "getDashboardStats",
        requesterUserCode: "staff001",
        requesterRole: "staff"
      })
    }
  };

  const response = doPost(mockEvent);
  Logger.log(response.getContent());
}

function testUpdateUser() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        action: "updateUser",
        id: 2,
        name: "เจ้าหน้าที่ทดสอบ (แก้ไข)",
        schoolName: "",
        areaService: "สพม.พิษณุโลก อุตรดิตถ์",
        email: "staff001@test.com",
        role: "staff",
        isActive: true,
        requesterUserCode: "admin001",
        requesterRole: "admin"
      })
    }
  };

  const response = doPost(mockEvent);
  Logger.log(response.getContent());
}

function testDeleteUser() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        action: "deleteUser",
        id: 2,
        requesterUserCode: "admin001",
        requesterRole: "admin"
      })
    }
  };

  const response = doPost(mockEvent);
  Logger.log(response.getContent());
}

function testCreateUser() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        action: "createUser",
        userCode: "staff001",
        name: "เจ้าหน้าที่ทดสอบ",
        schoolName: "",
        areaService: "สพม.พิษณุโลก อุตรดิตถ์",
        email: "staff001@test.com",
        password: "123456",
        role: "staff",
        isActive: true,
        requesterUserCode: "admin001",
        requesterRole: "admin"
      })
    }
  };

  const response = doPost(mockEvent);
  Logger.log(response.getContent());
}

function testAuthzAdminGetUsers() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        action: "getUsers",
        requesterUserCode: "admin001",
        requesterRole: "admin"
      })
    }
  };

  const response = doPost(mockEvent);
  Logger.log(response.getContent());
}

function testAuthzStaffGetSchools() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        action: "getSchools",
        requesterUserCode: "staff001",
        requesterRole: "staff"
      })
    }
  };

  const response = doPost(mockEvent);
  Logger.log(response.getContent());
}

function testAuthzSchoolGetSubmissionStatus() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        action: "getSubmissionStatus",
        requesterUserCode: "school002",
        requesterRole: "school"
      })
    }
  };

  const response = doPost(mockEvent);
  Logger.log(response.getContent());
}

function testAuthzForbiddenStaffGetUsers() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        action: "getUsers",
        requesterUserCode: "staff001",
        requesterRole: "staff"
      })
    }
  };

  const response = doPost(mockEvent);
  Logger.log(response.getContent());
}

function testConfig() {

  Logger.log(
    getSystemConfigs()
  );

}

function testSupabase() {

  const result =
    callSupabase(
      "users?select=*"
    );

  Logger.log(result);

}

function testLogin() {

  const result =
    handleLogin({

      username: "admin001",

      password: "123456"

    });

  Logger.log(result);

}

function testUploadPDF() {

  const fakeBase64 = "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";

  const result =
    saveFileToDrive(

      fakeBase64,

      "sc000_โรงเรียนเพิ่มพูนวิทยา_ประถมปลาย.pdf",

      "upper"

    );

  Logger.log(result);

}

function convertFileToBase64() {

  const fileId = "1WQ2KxCi5LLTLXr96pEJpzo_JBc14axDO";//ใส่_FILE_ID_ของ_PDF_ใน_Drive

  const file =
    DriveApp
      .getFileById(fileId);

  const blob =
    file.getBlob();

  const base64 =
    Utilities.base64Encode(
      blob.getBytes()
    );

  Logger.log(base64);

}

function testSaveSubmission() {
  const result = saveSubmission({
    userCode: "sc000",
    schoolName: "โรงเรียนเพิ่มพูนวิทยา",
    earlyFile: null,
    lowerFile: null,
    upperFile: "https://drive.google.com/file/d/test/view"
  });

  Logger.log(result);
}