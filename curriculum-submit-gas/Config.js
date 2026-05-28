const SPREADSHEET_ID = "1V_Q_3bOAsEkSoOwNWzTC2enJ7dePkzbr7om8xRauKVU";//ใส่ Spreadsheet ID ของ MASTER_CONFIG

function getConfig(key) {

  const sheet = SpreadsheetApp
    .openById(SPREADSHEET_ID)
    .getSheetByName("Config");

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {

    if (data[i][0] === key) {
      return data[i][1];
    }

  }

  return null;

}



function getSystemConfigs(){

 return {

   EARLY_FOLDER_ID:getConfig("EARLY_FOLDER_ID"),

   LOWER_FOLDER_ID:getConfig("LOWER_FOLDER_ID"),

   UPPER_FOLDER_ID:getConfig("UPPER_FOLDER_ID"),

   SUPABASE_URL:getConfig("SUPABASE_URL"),

   SUPABASE_KEY:getConfig("SUPABASE_KEY"),

   MAX_FILE_SIZE:getConfig("MAX_FILE_SIZE")

 };

}