"use strict";

import fs from "fs";
import {
  app,
  protocol,
  BrowserWindow,
  Menu,
  ipcMain,
  dialog,
  shell
} from "electron";
import {
  createProtocol,
  installVueDevtools
} from "vue-cli-plugin-electron-builder/lib";
const fsp = fs.promises;
const isDevelopment = process.env.NODE_ENV !== "production";
const testingFlags = {
  updateAvailable: true
};

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;
let childWindow;

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { secure: true, standard: true } }
]);

const mainMenuTemplate = [
  {
    label: "File",
    submenu: [
      {
        label: "Open Mapping File",
        accelerator: process.platform === "darwin" ? "Cmd+O" : "Ctrl+O",
        click() {
          const filePath = `${app.getPath("home")}/.nssm/game_ids.json`;
          shell.openItem(filePath);
          console.log("open output folder!");
        }
      },
      {
        label: "Check for Updates",
        click: async () => {
          const updateAvailable = await checkForUpdates();
          if (!updateAvailable) {
            showInfoMessage("You are already using the latest version.");
          } else {
            if (await checkToUpdate()) {
              createUpdateWindow();
            }
          }
        }
      },
      {
        type: "separator"
      },
      {
        label: "Quit",
        accelerator: process.platform === "darwin" ? "Cmd+Q" : "Ctrl+Q",
        click() {
          app.quit();
        }
      }
    ]
  }
];

function createUpdateWindow() {
  childWindow = new BrowserWindow({
    width: 800,
    height: 600,
    modal: true,
    autoHideMenuBar: true,
    parent: mainWindow
  });
  childWindow.loadURL(paths.baseUrl);
  childWindow.once("ready-to-show", () => {
    childWindow.show();
  });
}

function createMainWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 700,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      enableRemoteModule: true,
      webSecurity: false
    },
    resizable: true
  });

  Menu.buildFromTemplate(mainMenuTemplate);

  if (process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
    mainWindow.loadURL(process.env.WEBPACK_DEV_SERVER_URL);
    if (!process.env.IS_TEST) mainWindow.webContents.openDevTools();
  } else {
    createProtocol("app");
    // Load the index.html when not in development
    mainWindow.loadURL("app://./index.html");
  }

  const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
  // const mainMenu = Menu.buildFromTemplate([]);
  Menu.setApplicationMenu(mainMenu);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Quit when all windows are closed.
app.on("window-all-closed", () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createMainWindow();
  }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", async () => {
  if (isDevelopment && !process.env.IS_TEST) {
    // Install Vue Devtools
    try {
      await installVueDevtools();
    } catch (e) {
      console.error("Vue Devtools failed to install:", e.toString());
    }
  }
  const updateAvailable = await checkForUpdates();
  if (!updateAvailable) {
    loadApp();
  } else {
    const launchUpdater = await checkToUpdate();
    loadApp();
    if (launchUpdater) {
      createUpdateWindow();
    }
  }
});

async function checkToUpdate() {
  const response = await dialog.showMessageBox({
    message: `A new version is available. Would you like to download it now?`,
    type: "question",
    buttons: ["No", "Yes"],
    cancelId: 0
  });

  if (response.response === 1) {
    return true;
  }
}

async function loadApp() {
  await importGameIds();
  createMainWindow();
}

import axios from "axios";
import paths from "./paths.js";

function addGameId(gameId, gameName) {
  const filePath = `${app.getPath("home")}/.nssm/game_ids.json`;
  let fileContents;
  if (fs.existsSync(filePath)) {
    fileContents = fs.readFileSync(filePath, "utf8");
    const gameMap = JSON.parse(fileContents);
    if (!Object.keys(gameMap).includes(gameId) || !gameMap[gameId]) {
      gameMap[gameId] = gameName;
      fs.writeFileSync(filePath, JSON.stringify(gameMap, null, 2), "utf8");
    }
  }
}

function showInfoMessage(message) {
  dialog.showMessageBoxSync(mainWindow, {
    type: "info",
    buttons: ["OK"],
    cancelId: 0,
    message
  });
}

async function checkForUpdates() {
  const currentVersion = require("../package.json").version;
  let res;
  try {
    res = await axios(paths.versionPath, {
      method: "get",
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (e) {
    // Error downloading file or user is not online.
    return false;
  }

  const { data } = res;
  if (
    data.latest !== currentVersion ||
    (process.env.NODE_ENV !== "production" && testingFlags.updateAvailable)
  ) {
    return true;
  }

  return false;
}

async function importGameIds() {
  let res;
  try {
    res = await axios(paths.gameIdPath, {
      method: "get",
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (e) {
    res = {
      data: {}
    };
  }
  const { data } = res;
  const filePath = `${app.getPath("home")}/.nssm/game_ids.json`;
  let fileContents;

  if (fs.existsSync(filePath)) {
    fileContents = await fsp.readFile(filePath);
    const oldGameMap = JSON.parse(fileContents);
    const newGameMap = data;
    console.log("trying to update game id map", filePath);
    const newJson = {
      ...newGameMap,
      ...oldGameMap
    };
    await fsp.writeFile(filePath, JSON.stringify(newJson, null, 2), "utf8");
  } else {
    console.log("trying to set game id map", filePath);
    try {
      await fsp.mkdir(`${app.getPath("home")}/.nssm/`, { recursive: true });
      await fsp.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
    } catch (e) {
      console.log(e);
    }
  }
}

const { COPYFILE_EXCL } = fs.constants;
ipcMain.on("copy-files", (event, copyInstructions) => {
  copyInstructions.forEach(({ file, destination }) => {
    const copyFile = async (src, dest) => {
      await fsp.copyFile(src, dest, COPYFILE_EXCL);
    };

    console.log("next copy attempt starting...");
    copyFile(file, destination);
    console.log("copy attempt finished");

    event.sender.send("copy-progress", file, destination);
  });

  event.sender.send("files-copied");
});

ipcMain.on("addGameId", (event, gameId, gameName) => {
  addGameId(gameId, gameName);
});

ipcMain.on("read-settings", async event => {
  const filePath = `${app.getPath("home")}/.nssm/settings.json`;
  try {
    const fileContents = fs.readFileSync(filePath, "utf8");
    const settingsObj = JSON.parse(fileContents);
    event.sender.send("receive-settings", settingsObj);
  } catch (e) {
    event.sender.send("receive-settings", {});
  }
});

function updateSettingsFile(key, newValue) {
  let filePath = `${app.getPath("home")}/.nssm/settings.json`;
  console.log("trying to save file", filePath);
  let fileContents;
  let fileJson = {};

  if (fs.existsSync(filePath)) {
    fileContents = fs.readFileSync(filePath);
    fileJson = JSON.parse(fileContents);
  }

  fileJson[key] = newValue;

  try {
    return fs.writeFileSync(
      filePath,
      JSON.stringify(fileJson, null, 2),
      "utf8"
    );
  } catch (e) {
    return Promise.reject(e);
  }
}

ipcMain.on("change-path", async (event, pathName, value) => {
  updateSettingsFile(pathName, value);
});

ipcMain.on("select-sd-card-dir", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "SD Card Directory",
    properties: ["openDirectory"]
  });

  let newPath;
  if (!result.canceled) {
    newPath = result.filePaths[0];
    if (fs.existsSync(`${newPath}/Nintendo`)) {
      try {
        await updateSettingsFile("sdCardDir", newPath);
        mainWindow.webContents.send("setSdCardDir", newPath);
      } catch (e) {
        console.log("Error: Your settings could not be saved:", e);
      }
    } else {
      mainWindow.webContents.send("setSdCardDir");
      console.log("Error: No Nintendo folder found!");
    }
  } else {
    console.log("No directory selected");
  }
});

ipcMain.on("select-output-dir", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Output Directory",
    properties: ["openDirectory"]
  });

  let newPath;
  if (!result.canceled) {
    newPath = result.filePaths[0];
    try {
      await updateSettingsFile("outputDir", newPath);
      console.log("set new output dir", newPath);
      mainWindow.webContents.send("setOutputDir", newPath);
    } catch (e) {
      console.log("Error: Your settings could not be saved:", e);
    }
  } else {
    console.log("No directory selected");
  }
});

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === "win32") {
    process.on("message", data => {
      if (data === "graceful-exit") {
        app.quit();
      }
    });
  } else {
    process.on("SIGTERM", () => {
      app.quit();
    });
  }
}
